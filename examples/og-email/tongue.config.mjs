/** @type {import('next-tongue').TongueConfig} */
export default {
  locales: ['en', 'de', 'ar'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  timeZone: 'UTC',
  routing: { prefix: 'always' },
};
