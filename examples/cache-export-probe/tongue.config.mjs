/** @type {import('next-tongue').TongueConfig} */
export default {
  locales: ['en'],
  defaultLocale: 'en',
  messages: './messages/{locale}.json',
  routing: { prefix: 'always' },
};
