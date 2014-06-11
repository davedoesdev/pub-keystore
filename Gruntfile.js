/*jslint node: true */
"use strict";

module.exports = function (grunt)
{
    grunt.initConfig(
    {
        jslint: {
            all: {
                src: [ 'Gruntfile.js', 'index.js', 'couchdb/*.js', 'pouchdb/*.js', 'test/**/*.js', 'scripts/*.js' ],
                directives: {
                    white: true
                }
            }
        },

        cafemocha: {
            default: {
                src: ['test/*.js'],
                options: {
                    timeout: 10000,
                    bail: true
                }
            }
        },

        apidox: {
            input: ['docs.js'],
            output: 'README.md',
            fullSourceDescription: true,
            extraHeadingLevels: 1,
            sections: {
                'module.exports': '\n## Opening a key store',
                'PubKeyStore.prototype.add_pub_key': '\n## PubKeyStore\n### Adding and removing keys',
                'PubKeyStore.prototype.get_pub_key_by_uri': '\n### Retrieving keys',
                'PubKeyStore.prototype.close': '\n### Lifecycle',
                'PubKeyStore.prototype.deploy': '\n### Replication (PouchDB only)',
                'PubKeyStore.events.change': '\n### Events'
            }
        },

        exec: {
            cover: {
                cmd: './node_modules/.bin/istanbul cover -x couchdb/design.js -x pouchdb/design.js ./node_modules/.bin/grunt -- test --cover',
                maxBuffer: 10000 * 1024
            },

            check_cover: {
                cmd: './node_modules/.bin/istanbul check-coverage --statement 80 --branch 65 --function 80 --line 80'
            },

            coveralls: {
                cmd: 'cat coverage/lcov.info | coveralls'
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-jslint');
    grunt.loadNpmTasks('grunt-cafe-mocha');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');

    grunt.registerTask('lint', 'jslint:all');
    grunt.registerTask('test', 'cafemocha:default');
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', ['exec:cover', 'exec:check_cover']);
    grunt.registerTask('coveralls', 'exec:coveralls');
    grunt.registerTask('default', ['jslint', 'cafemocha']);
};
