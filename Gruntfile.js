/*jslint node: true */
"use strict";

module.exports = function (grunt)
{
    grunt.initConfig(
    {
        jshint: {
            src: [ 'Gruntfile.js', 'index.js', 'couchdb/*.js', 'pouchdb/*.js', 'test/**/*.js', 'scripts/*.js' ]
        },

        mochaTest: {
            src: ['test/*.js'],
            options: {
                timeout: 10000,
                bail: true
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

        bgShell: {
            cover: {
                cmd: './node_modules/.bin/istanbul cover -x couchdb/design.js -x pouchdb/design.js ./node_modules/.bin/grunt -- test --cover',
                fail: true,
                execOpts: {
                    maxBuffer: 0
                }
            },

            check_cover: {
                cmd: './node_modules/.bin/istanbul check-coverage --statement 78 --branch 65 --function 80 --line 80',
                fail: true
            },

            coveralls: {
                cmd: 'cat coverage/lcov.info | coveralls',
                fail: true
            }
        }
    });
    
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-mocha-test');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-bg-shell');

    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('test', 'mochaTest');
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', ['bgShell:cover', 'bgShell:check_cover']);
    grunt.registerTask('coveralls', 'bgShell:coveralls');
    grunt.registerTask('default', ['lint', 'test']);
};
