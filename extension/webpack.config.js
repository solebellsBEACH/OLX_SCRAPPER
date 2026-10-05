const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");

/** @returns {import('webpack').Configuration} */
module.exports = (_env, argv) => ({
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
    popup: "./src/popup.ts",
  },
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  // Manifest V3 proíbe eval(); nunca usar source maps baseados em eval.
  devtool: argv.mode === "production" ? false : "cheap-source-map",
  plugins: [
    new CopyPlugin({
      patterns: [
        { from: "src/manifest.json", to: "manifest.json" },
        { from: "src/icons", to: "icons" },
        { from: "public/popup.html", to: "popup.html" },
        { from: "styles/popup.css", to: "popup.css" },
      ],
    }),
  ],
});
