module.exports = {
  mode: 'development',
  entry: {
    index: './src/index.ts',
    index3d: './src/3d/index.ts'
  },
  output: {
    path: `${__dirname}/dist`,
    filename: '[name].js'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader'
      },
      {
        test: /\.css$/,
        use: 'raw-loader'
      },
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
}
