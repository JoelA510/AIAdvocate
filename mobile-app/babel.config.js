// mobile-app/babel.config.js
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      [
        "module-resolver",
        {
          alias: {
            "@": "./src",
          },
        },
      ],
    ],
  };
};

// This configuration file is for a React Native project using Expo.
// It sets up Babel to use the Expo preset and configures module resolution
// to allow importing modules using the '@' alias for the 'src' directory.
// The 'api.cache(true)' line enables caching for performance optimization.
// The 'module-resolver' plugin is used to simplify import paths in the project.
// This setup is common in React Native projects to streamline development and maintain cleaner code.
// The '@' alias allows you to import files from the 'src' directory easily,
// making your imports more concise and readable, such as:
// import MyComponent from '@/components/MyComponent';
// instead of using relative paths like:
// import MyComponent from '../../components/MyComponent';
// This configuration is essential for maintaining a clean and organized codebase in React Native applications.
// It helps in avoiding long relative paths and makes the codebase more maintainable.
// Ensure that your project structure aligns with this configuration for it to work correctly.
// You can customize the alias as needed based on your project structure.
// Make sure to install the necessary dependencies for this configuration to work:
// npm install --save-dev babel-preset-expo babel-plugin-module-resolver
// or
// yarn add --dev babel-preset-expo babel-plugin-module-resolver
// This will ensure that Babel can resolve the '@' alias correctly during the build process.
// Additionally, you can add more aliases or modify existing ones as your project grows.
// This flexibility allows you to adapt the configuration to your specific project needs.
// Remember to restart your development server after making changes to the Babel configuration
// to ensure that the new settings take effect.
