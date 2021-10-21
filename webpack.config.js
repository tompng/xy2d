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
      },
      {
        test: /\.css$/,
        use: 'raw-loader'
      },
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js']
  }
}
