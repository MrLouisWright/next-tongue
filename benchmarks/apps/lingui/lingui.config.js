/** @type {import('@lingui/conf').LinguiConfig} */
const config = {
  locales: ['en', 'de', 'fr'],
  sourceLocale: 'en',
  catalogs: [
    {
      path: '<rootDir>/locales/{locale}/messages',
      include: ['src'],
    },
  ],
  format: 'po',
};

export default config;
