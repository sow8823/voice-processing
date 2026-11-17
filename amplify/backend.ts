import { defineBackend } from '@aws-amplify/backend';

/**
 * 静的ホスティングのみの構成
 * バックエンドリソース（Auth, Data等）は現時点では不要
 * @see https://docs.amplify.aws/react/build-a-backend/
 */
defineBackend({});
