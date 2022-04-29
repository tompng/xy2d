const CopyPlugin = require('copy-webpack-plugin')

module.exports = {
  mode: 'development',
  entry: {
    index2d: './src/2d/index.ts',
    index3d: './src/3d/index.tsx',
    worker3d: './src/3d/worker.ts'
  },
  output: {
    path: `${__dirname}/dist`,
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader'
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: 'node_modules/mathlive/dist/fonts', to: 'fonts' }]
    })
  ]
}
