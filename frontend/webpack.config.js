const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// En dev, les appels /api/* sont relayés vers les services lancés par `npm run up` (en prod : nginx)
const AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3001';
const PAYMENT_URL = process.env.PAYMENT_URL ?? 'http://localhost:3002';

module.exports = (_env, argv) => ({
  entry: './src/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: argv.mode === 'production' ? '[name].[contenthash].js' : '[name].js',
    publicPath: '/',
    clean: true,
  },
  resolve: { extensions: ['.tsx', '.ts', '.js'] },
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              '@babel/preset-env',
              ['@babel/preset-react', { runtime: 'automatic' }],
              '@babel/preset-typescript',
            ],
          },
        },
      },
      { test: /\.css$/, use: ['style-loader', 'css-loader'] },
    ],
  },
  plugins: [new HtmlWebpackPlugin({ template: './public/index.html' })],
  performance: { hints: false }, // ~270 Ko minifié, essentiellement React
  devtool: argv.mode === 'production' ? false : 'eval-source-map',
  devServer: {
    port: 3000,
    historyApiFallback: true,
    proxy: [
      { context: ['/api/auth'], target: AUTH_URL, pathRewrite: { '^/api/auth': '' } },
      { context: ['/api/payment'], target: PAYMENT_URL, pathRewrite: { '^/api/payment': '' } },
    ],
  },
});
