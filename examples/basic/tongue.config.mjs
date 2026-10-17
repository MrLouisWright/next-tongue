/** @type {import('next-tongue').TongueConfig} */
export default {
  locales: ['en', 'de'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  timeZone: 'UTC',
  routing: { prefix: 'as-needed' },
};
