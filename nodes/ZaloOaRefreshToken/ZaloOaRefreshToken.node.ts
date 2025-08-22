import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	NodeOperationError,
	NodeConnectionType,
} from 'n8n-workflow';

import axios from 'axios';

export class ZaloOaRefreshToken implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zalo OA Refresh Token',
		name: 'zaloOaRefreshToken',
		icon: 'file:zalo.svg',
		group: ['Zalo'],
		version: 3.0,
		subtitle: 'Refresh Zalo Official Account access token with database storage',
		description: 'Refresh Zalo OA access token and store it in database for reuse',
		defaults: {
			name: 'Zalo OA Refresh Token',
		},
		inputs: [{ type: NodeConnectionType.Main }],
		outputs: [{ type: NodeConnectionType.Main }],
		credentials: [
			{
				name: 'zaloOaApi',
				required: true,
				displayName: 'Zalo OA API Credential',
			},
		],
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Refresh Token',
						value: 'refreshToken',
						description: 'Refresh the access token and store in database',
					},
					{
						name: 'Check Token Status',
						value: 'checkStatus',
						description: 'Check if current access token is still valid',
					},
				],
				default: 'refreshToken',
			},
			{
				displayName: 'Return Access Token',
				name: 'returnAccessToken',
				type: 'boolean',
				default: false,
				description: 'Whether to return the actual access token in response (useful for webhook endpoints)',
				displayOptions: {
					show: {
						operation: ['checkStatus'],
					},
				},
			},
		],
	};

	// Static helper function to get database connection
	static async getDbConnection(executeFunctions: IExecuteFunctions) {
		try {
			// Try to get database connection from n8n context
			const dbConnection = executeFunctions.getWorkflowStaticData('global').dbConnection;
			if (dbConnection) {
				return dbConnection;
			}

			// Fallback: try to access n8n's database directly
			const Container = require('typedi').Container;
			const Db = Container.get('Database');
			return Db;
		} catch (error) {
			console.log('Could not get database connection:', error);
			return null;
		}
	}

	// Static helper function to get tokens from multiple sources with priority
	static async getTokensFromDatabase(executeFunctions: IExecuteFunctions, credentials: any): Promise<{ accessToken: string; refreshToken: string; expiresAt?: string }> {
		const now = new Date().toISOString();
		console.log(`[${now}] Fetching tokens using priority system...`);
		
		// Priority 1: Workflow static data (most reliable)
		try {
			const globalData = executeFunctions.getWorkflowStaticData('global');
			if (globalData.zaloOaAccessToken && globalData.zaloOaRefreshToken) {
				console.log(`[${now}] ✅ Found tokens in workflow static data`);
				return {
					accessToken: globalData.zaloOaAccessToken as string,
					refreshToken: globalData.zaloOaRefreshToken as string,
					expiresAt: globalData.zaloOaExpiresAt as string | undefined
				};
			}
		} catch (staticError) {
			console.log(`[${now}] ⚠️  Static data fetch failed:`, staticError);
		}
		
		// Priority 2: Environment variables
		try {
			if (process.env.ZALO_OA_ACCESS_TOKEN && process.env.ZALO_OA_REFRESH_TOKEN) {
				console.log(`[${now}] ✅ Found tokens in environment variables`);
				return {
					accessToken: process.env.ZALO_OA_ACCESS_TOKEN,
					refreshToken: process.env.ZALO_OA_REFRESH_TOKEN,
					expiresAt: process.env.ZALO_OA_EXPIRES_AT
				};
			}
		} catch (envError) {
			console.log(`[${now}] ⚠️  Environment variable fetch failed:`, envError);
		}
		
		// Priority 3: Database (if available)
		try {
			const db = await ZaloOaRefreshToken.getDbConnection(executeFunctions);
			if (db) {
				console.log(`[${now}] Attempting to fetch tokens from database...`);

				const accessTokenQuery = await db.query(
					`SELECT value FROM variables WHERE key = 'zalo_oa_access_token' ORDER BY id DESC LIMIT 1`
				);
				const refreshTokenQuery = await db.query(
					`SELECT value FROM variables WHERE key = 'zalo_oa_refresh_token' ORDER BY id DESC LIMIT 1`
				);
				const expiresAtQuery = await db.query(
					`SELECT value FROM variables WHERE key = 'zalo_oa_expires_at' ORDER BY id DESC LIMIT 1`
				);

				if (accessTokenQuery.length > 0 && refreshTokenQuery.length > 0) {
					console.log(`[${now}] ✅ Found tokens in database`);
					return {
						accessToken: accessTokenQuery[0].value,
						refreshToken: refreshTokenQuery[0].value,
						expiresAt: expiresAtQuery.length > 0 ? expiresAtQuery[0].value : undefined
					};
				}
			}
		} catch (dbError) {
			console.log(`[${now}] ⚠️  Database token fetch failed:`, dbError);
		}

		// Priority 4: Fallback to credentials
		console.log(`[${now}] ⚠️  No stored tokens found, using credentials`);
		return {
			accessToken: credentials.accessToken,
			refreshToken: credentials.refreshToken,
			expiresAt: credentials.expiresAt
		};
	}

	// Static helper function to save tokens to database
	static async saveTokensToDatabase(executeFunctions: IExecuteFunctions, accessToken: string, refreshToken: string, expiresAt: string): Promise<boolean> {
		const now = new Date().toISOString();
		
		try {
			console.log(`[${now}] Saving tokens using multiple methods...`);
			
			// Primary method: Use workflow static data (most reliable)
			try {
				const globalData = executeFunctions.getWorkflowStaticData('global');
				globalData.zaloOaAccessToken = accessToken;
				globalData.zaloOaRefreshToken = refreshToken;
				globalData.zaloOaExpiresAt = expiresAt;
				console.log(`[${now}] ✅ Tokens saved to workflow static data`);
			} catch (staticError) {
				console.log(`[${now}] ❌ Static data save failed:`, staticError);
			}
			
			// Secondary method: Try database if available
			try {
				const db = await ZaloOaRefreshToken.getDbConnection(executeFunctions);
				if (db) {
					console.log(`[${now}] Database connection available, saving tokens...`);
					
					// Fixed SQL with proper ID handling for SQLite
					const queries = [
						{key: 'zalo_oa_access_token', value: accessToken},
						{key: 'zalo_oa_refresh_token', value: refreshToken},  
						{key: 'zalo_oa_expires_at', value: expiresAt}
					];
					
					for (const q of queries) {
						try {
							// Use INSERT OR REPLACE with proper ID handling
							await db.query(`
								INSERT OR REPLACE INTO variables (id, key, value, type) 
								VALUES (
									COALESCE((SELECT id FROM variables WHERE key = ?), hex(randomblob(16))),
									?, ?, 'string'
								)`, [q.key, q.key, q.value]);
							console.log(`[${now}] ✅ Saved ${q.key} to database`);
						} catch (queryError) {
							console.log(`[${now}] ❌ Failed to save ${q.key}:`, queryError);
						}
					}
				} else {
					console.log(`[${now}] ⚠️  Database connection not available`);
				}
			} catch (dbError) {
				console.log(`[${now}] ❌ Database save failed:`, dbError);
			}
			
			// Tertiary method: Environment variables (fallback)
			try {
				process.env.ZALO_OA_ACCESS_TOKEN = accessToken;
				process.env.ZALO_OA_REFRESH_TOKEN = refreshToken;
				process.env.ZALO_OA_EXPIRES_AT = expiresAt;
				console.log(`[${now}] ✅ Tokens saved to environment variables`);
			} catch (envError) {
				console.log(`[${now}] ❌ Environment variable save failed:`, envError);
			}
			
			console.log(`[${now}] Token save process completed`);
			return true;
			
		} catch (error) {
			console.log(`[${now}] ❌ All save methods failed:`, error);
			return false;
		}
	}

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;
		const now = new Date().toISOString();

		for (let i = 0; i < items.length; i++) {
			try {
				// Get credentials
				const credentials = await this.getCredentials('zaloOaApi');
				const appId = credentials.appId as string;
				const secretKey = credentials.secretKey as string;

				// Get tokens from database with fallback to credentials
				const tokenData = await ZaloOaRefreshToken.getTokensFromDatabase(this, credentials);
				const refreshToken = tokenData.refreshToken;
				const currentAccessToken = tokenData.accessToken;
				const currentExpiresAt = tokenData.expiresAt;

				// Debug logging
				console.log(`[${now}] Zalo OA Refresh Token - Operation: ${operation}`);
				console.log(`[${now}] Using refresh_token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'Not set'}`);
				console.log(`[${now}] Current access_token: ${currentAccessToken ? currentAccessToken.substring(0, 20) + '...' : 'Not set'}`);
				console.log(`[${now}] Token expires at: ${currentExpiresAt}`);

				if (operation === 'refreshToken') {
					// Call Zalo refresh token API
					const response = await axios.post(
						'https://oauth.zaloapp.com/v4/oa/access_token',
						new URLSearchParams({
							refresh_token: refreshToken,
							app_id: appId,
							grant_type: 'refresh_token',
						}),
						{
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'secret_key': secretKey,
							},
						}
					);

					const data = response.data;

					if (data.access_token && data.refresh_token) {
						// Calculate expiry time
						const expiresAt = new Date();
						expiresAt.setSeconds(expiresAt.getSeconds() + parseInt(data.expires_in));

						// Try to save tokens to database
						const dbSaveSuccess = await ZaloOaRefreshToken.saveTokensToDatabase(
							this,
							data.access_token,
							data.refresh_token,
							expiresAt.toISOString()
						);

						console.log(`[${now}] New access_token: ${data.access_token ? data.access_token.substring(0, 20) + '...' : 'Not received'}`);
						console.log(`[${now}] New refresh_token: ${data.refresh_token ? data.refresh_token.substring(0, 20) + '...' : 'Not received'}`);
						console.log(`[${now}] Database save successful: ${dbSaveSuccess}`);

						returnData.push({
							json: {
								success: true,
								message: 'Token refreshed successfully and saved to database',
								access_token: data.access_token,
								refresh_token: data.refresh_token,
								expires_in: data.expires_in,
								expires_at: expiresAt.toISOString(),
								db_save_success: dbSaveSuccess,
								refresh_executed_at: now,
							},
							pairedItem: {
								item: i,
							},
						});
					} else {
						throw new NodeOperationError(
							this.getNode(),
							`Failed to refresh token: ${JSON.stringify(data)}`
						);
					}
				} else if (operation === 'checkStatus') {
					// Get returnAccessToken parameter for checkStatus operation
					const returnAccessToken = this.getNodeParameter('returnAccessToken', i) as boolean;

					// Check if current token is still valid
					const currentTime = new Date();
					const expiryDate = currentExpiresAt ? new Date(currentExpiresAt) : null;

					const isValid = expiryDate ? currentTime < expiryDate : false;
					const timeUntilExpiry = expiryDate ? expiryDate.getTime() - currentTime.getTime() : 0;
					const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));

					// Prepare response data
					const responseJson: any = {
						is_valid: isValid,
						expires_at: currentExpiresAt,
						hours_until_expiry: hoursUntilExpiry,
						should_refresh: hoursUntilExpiry < 2, // Refresh if less than 2 hours left
						check_executed_at: now,
					};

					// Add access token based on the returnAccessToken parameter
					if (returnAccessToken) {
						responseJson.access_token = currentAccessToken || null;
					} else {
						responseJson.current_access_token_preview = currentAccessToken ? '***' + currentAccessToken.slice(-10) : 'Not set';
					}

					returnData.push({
						json: responseJson,
						pairedItem: {
							item: i,
						},
					});
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : String(error);
				console.log(`[${now}] Error in ${operation} operation:`, errorMessage);
				
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: errorMessage,
							success: false,
							operation: operation,
							timestamp: now,
						},
						pairedItem: {
							item: i,
						},
					});
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Failed to execute operation '${operation}': ${errorMessage}`
					);
				}
			}
		}

		return [returnData];
	}
}
