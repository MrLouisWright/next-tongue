/** @type {import('next-tongue').TongueConfig} */
export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  timeZone: 'UTC',
  // output: 'export' only supports prefix: 'always' (ROADMAP / docs)
  routing: { prefix: 'always' },
};
