/**
 * Babel Configuration for LLMLog Chrome Extension Testing
 * 
 * Transforms ES6 modules for Jest testing environment
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 'current',
        },
        modules: 'commonjs', // Transform ES6 modules to CommonJS for Jest
      },
    ],
  ],
  plugins: [
    // Add any additional Babel plugins here if needed
  ],
  env: {
    test: {
      presets: [
        [
          '@babel/preset-env',
          {
            targets: {
              node: 'current',
            },
            modules: 'commonjs',
          },
        ],
      ],
    },
  },
};
