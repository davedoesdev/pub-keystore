/*jslint node: true */
"use strict";

const c8 = "npx c8 -x Gruntfile.js -x 'test/**' -x couchdb/design.js -x pouchdb/design.js";

module.exports = function (grunt)
{
    grunt.initConfig(
    {
        jshint: {
            src: [
                'Gruntfile.js',
                'index.js',
                'couchdb/*.js',
                'pouchdb/*.js',
                'test/**/*.js',
                'scripts/*.js',
                'sql/**/*.js'
            ],
            options: {
                esversion: 9,
                node: true
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

        exec: Object.fromEntries(Object.entries({
            test: 'mocha --bail --timeout 10000',
            cover: `${c8} npx grunt test --cover`,
            cover_report: `${c8} report -r lcov`,
            cover_check: `${c8} check-coverage --statements 75 --branches 65 --functions 70 --lines 80`
        }).map(([k, cmd]) => [k, { cmd, stdio: 'inherit' }]))
    });
    
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-apidox');
    grunt.loadNpmTasks('grunt-exec');

    grunt.registerTask('lint', 'jshint');
    grunt.registerTask('test', 'exec:test');
    grunt.registerTask('docs', 'apidox');
    grunt.registerTask('coverage', ['exec:cover',
                                    'exec:cover_report',
                                    'exec:cover_check']);
    grunt.registerTask('default', ['lint', 'test']);
};
