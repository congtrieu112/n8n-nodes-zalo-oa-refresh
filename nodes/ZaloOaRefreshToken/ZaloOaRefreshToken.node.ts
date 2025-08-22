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
		version: 2,
		subtitle: 'Refresh Zalo Official Account access token',
		description: 'Automatically refresh Zalo OA access token using refresh token',
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
						description: 'Refresh the access token using refresh token',
					},
					{
						name: 'Check Token Status',
						value: 'checkStatus',
						description: 'Check if current access token is still valid',
					},
					{
						name: 'Update Credential from Data',
						value: 'updateCredential',
						description: 'Update credential with new token data from previous refresh',
					},
				],
				default: 'refreshToken',
			},
			{
				displayName: 'Auto Update Credential',
				name: 'autoUpdateCredential',
				type: 'boolean',
				default: true,
				description: 'Whether to automatically update the credential with new tokens',
				displayOptions: {
					show: {
						operation: ['refreshToken'],
					},
				},
			},
			{
				displayName: 'Force Fresh Credential',
				name: 'forceFreshCredential',
				type: 'boolean',
				default: true,
				description: 'Force getting fresh credentials from database to ensure latest tokens are used',
				displayOptions: {
					show: {
						operation: ['refreshToken'],
					},
				},
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				// Get fresh credentials for each iteration to ensure we have the latest tokens
				const credentials = await this.getCredentials('zaloOaApi');
				const appId = credentials.appId as string;
				const secretKey = credentials.secretKey as string;
				const refreshToken = credentials.refreshToken as string;
				const currentAccessToken = credentials.accessToken as string;
				const currentExpiresAt = credentials.expiresAt as string;
				const credentialUpdatedAt = credentials.updatedAt as string || 'Unknown';
				
				// Debug logging
				const now = new Date().toISOString();
				console.log(`[${now}] Zalo OA Refresh Token - Operation: ${operation}`);
				console.log(`[${now}] Current refresh_token: ${refreshToken ? refreshToken.substring(0, 20) + '...' : 'Not set'}`);
				console.log(`[${now}] Current access_token: ${currentAccessToken ? currentAccessToken.substring(0, 20) + '...' : 'Not set'}`);
				console.log(`[${now}] Credential last updated: ${credentialUpdatedAt}`);
				console.log(`[${now}] Token expires at: ${currentExpiresAt}`);

				if (operation === 'refreshToken') {
					// Get autoUpdateCredential parameter for refreshToken operation
					const autoUpdateCredential = this.getNodeParameter('autoUpdateCredential', i) as boolean;
					
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

						const tokenData = {
							access_token: data.access_token,
							refresh_token: data.refresh_token,
							expires_in: data.expires_in,
							expires_at: expiresAt.toISOString(),
						};

						// Auto-update credential if requested - Return credential data in a format n8n can understand
						let credentialUpdateStatus = 'not_attempted';
						let credentialUpdateData = null;
						
						if (autoUpdateCredential) {
							try {
								// Get current credential details
								const nodeCredentials = this.getNode().credentials;
								if (nodeCredentials && nodeCredentials['zaloOaApi']) {
									credentialUpdateStatus = 'prepared';
									
									// Prepare updated credential data following n8n credential structure
									credentialUpdateData = {
										credentialId: nodeCredentials['zaloOaApi'].id,
										credentialName: nodeCredentials['zaloOaApi'].name,
										credentialType: 'zaloOaApi',
										updatedFields: {
											accessToken: data.access_token,
											refreshToken: data.refresh_token,
											expiresAt: expiresAt.toISOString(),
											updatedAt: now
										},
										// Include all original credential data
										fullCredentialData: {
											appId: credentials.appId,
											secretKey: credentials.secretKey,
											accessToken: data.access_token,
											refreshToken: data.refresh_token,
											expiresAt: expiresAt.toISOString(),
											updatedAt: now
										}
									};
									
									console.log(`[${now}] Credential update data prepared for: ${nodeCredentials['zaloOaApi'].name}`);
									console.log(`[${now}] Credential ID: ${nodeCredentials['zaloOaApi'].id}`);
								} else {
									credentialUpdateStatus = 'no_credentials_found';
									console.log(`[${now}] Cannot prepare credential update - No zaloOaApi credentials found`);
								}
							} catch (updateError) {
								credentialUpdateStatus = 'error';
								console.log(`[${now}] Credential update preparation error:`, updateError);
							}
						}

						console.log(`[${now}] New access_token: ${data.access_token ? data.access_token.substring(0, 20) + '...' : 'Not received'}`);
						console.log(`[${now}] New refresh_token: ${data.refresh_token ? data.refresh_token.substring(0, 20) + '...' : 'Not received'}`);
						
						// Create detailed message with copy-paste instructions
						const nodeCredentials = this.getNode().credentials;
						const credentialName = nodeCredentials && nodeCredentials['zaloOaApi'] 
							? nodeCredentials['zaloOaApi'].name 
							: 'Zalo OA API Credential';
						
						const updateInstructions = `
🔄 TOKEN REFRESH SUCCESSFUL!

⚠️ IMPORTANT: You must manually update the credential to prevent future errors.

📋 COPY these values to credential "${credentialName}":

1. Access Token: ${data.access_token}
2. Refresh Token: ${data.refresh_token}
3. Token Expires At: ${expiresAt.toISOString()}

🔗 Go to: Credentials > "${credentialName}" > Edit
📝 Paste the new Access Token and Refresh Token
💾 Click Save

⏰ Token expires: ${expiresAt.toLocaleString()}
🔄 Last refresh: ${new Date(now).toLocaleString()}

Without this manual update, the next refresh will fail with the old token!`;

						returnData.push({
							json: {
								success: true,
								message: 'Token refreshed successfully - MANUAL UPDATE REQUIRED',
								update_instructions: updateInstructions,
								...tokenData,
								credential_update_needed: true,
								credential_update_status: credentialUpdateStatus,
								credential_name: credentialName,
								credential_last_updated: credentialUpdatedAt,
								refresh_executed_at: now,
								// Direct field mapping for easy copy-paste
								new_access_token: data.access_token,
								new_refresh_token: data.refresh_token,
								new_expires_at: expiresAt.toISOString(),
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
					const now = new Date();
					const expiryDate = currentExpiresAt ? new Date(currentExpiresAt) : null;
					
					const isValid = expiryDate ? now < expiryDate : false;
					const timeUntilExpiry = expiryDate ? expiryDate.getTime() - now.getTime() : 0;
					const hoursUntilExpiry = Math.floor(timeUntilExpiry / (1000 * 60 * 60));

					// Prepare response data
					const responseJson: any = {
						is_valid: isValid,
						expires_at: currentExpiresAt,
						hours_until_expiry: hoursUntilExpiry,
						should_refresh: hoursUntilExpiry < 2, // Refresh if less than 2 hours left
						credential_last_updated: credentialUpdatedAt,
						check_executed_at: now.toISOString(),
					};

					// Add access token based on the returnAccessToken parameter
					if (returnAccessToken) {
						responseJson.access_token = currentAccessToken || null;
					} else {
						responseJson.current_access_token = currentAccessToken ? '***' + currentAccessToken.slice(-10) : 'Not set';
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
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: errorMessage,
							success: false,
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
