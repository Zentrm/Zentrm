module.exports = {
  publicPath: './',
  devServer: {
    port: 8080,
    proxy: {
      '/ws': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  },
  transpileDependencies: ['xterm', 'xterm-addon-fit', 'xterm-addon-web-links']
}
