import {
	ICredentialType,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

export class ZaloOaApi implements ICredentialType {
	name = 'zaloOaApi';
	displayName = 'Zalo Official Account API';
	documentationUrl = 'https://developers.zalo.me/docs/api/official-account-api';
	
	icon: Icon = 'file:zalo.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'App ID',
			name: 'appId',
			type: 'string',
			default: '',
			required: true,
			description: 'The App ID from Zalo Developer Console',
		},
		{
			displayName: 'Secret Key',
			name: 'secretKey',
			type: 'string',
			default: '',
			required: true,
			typeOptions: {
				password: true,
			},
			description: 'The Secret Key from Zalo Developer Console',
		},
		{
			displayName: 'Access Token',
			name: 'accessToken',
			type: 'string',
			default: '',
			typeOptions: {
				password: true,
			},
			description: 'Current access token (will be auto-updated by refresh flow)',
		},
		{
			displayName: 'Refresh Token',
			name: 'refreshToken',
			type: 'string',
			default: '',
			required: true,
			typeOptions: {
				password: true,
			},
			description: 'The refresh token used to get new access tokens',
		},
		{
			displayName: 'Token Expires At',
			name: 'expiresAt',
			type: 'string',
			default: '',
			description: 'When the current access token expires (ISO date string)',
		},
	];
}
