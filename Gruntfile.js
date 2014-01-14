/* jshint node: true */

'use strict';

module.exports = function(grunt) {
  grunt.initConfig({
    typescript: {
      // Client side code uses amd modules and require.js.
      client: {
        src: ['src/**/*.ts'],
        dest: 'js/client',
        options: {
          module: 'amd',
          target: 'es5',
          base_path: 'src',
          sourcemap: true,
          declaration: false,
          comments: true
        }
      },
      // Node.js code uses commonjs modules and no sourcemap generated.
      server: {
        src: ['src/**/*.ts'],
        dest: 'js/server',
        options: {
          module: 'commonjs',
          target: 'es5',
          base_path: 'src',
          sourcemap: false,
          declaration: false,
          comments: true
        }
      }
    },

    // Recompile to JavaScript when a file changes.
    watch: {
      client: {
        files: [
          'src/**/*.ts',
          '!src/server/*.ts'
        ],
        tasks: ['typescript:client'],
        options: {
          spawn: false
        }
      },
      server: {
        files: [
          'src/server/*.ts',
          'src/utils/*.ts',
          'src/utils.ts'
        ],
        tasks: ['typescript:server'],
        options: {
          spawn: false
        }
      }
    }
  });

  grunt.loadNpmTasks('grunt-typescript');
  grunt.loadNpmTasks('grunt-contrib-watch');

  grunt.registerTask('client', ['typescript:client']);
  grunt.registerTask('server', ['typescript:server']);

  grunt.registerTask('default', ['client', 'server']);
};
