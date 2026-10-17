/** @type {import('next-tongue').TongueConfig} */
export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  // Workspace package path for shared messages (#21).
  messages: '../../packages/messages/{locale}.json',
  routing: { prefix: 'always' },
};
