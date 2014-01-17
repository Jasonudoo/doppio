/// <reference path="vendor/DefinitelyTyped/node/node.d.ts" />
/// <reference path="vendor/DefinitelyTyped/gruntjs/gruntjs.d.ts" />
/**
 * Contains all of doppio's grunt build tasks in TypeScript.
 */
import path = require('path');
import fs = require('fs');
import child_process = require('child_process');
import os = require('os');
import url = require('url');
var exec = child_process.exec,
    NUM_CPUS = os.cpus().length,
    DEBS_DOMAIN: string = "http://security.ubuntu.com/ubuntu/pool/main/o/openjdk-6/",
    DEBS: string[] = [
        "openjdk-6-jre-headless_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jdk_6b27-1.12.6-1ubuntu0.12.04.4_i386.deb",
        "openjdk-6-jre-lib_6b27-1.12.6-1ubuntu0.12.04.4_all.deb"
    ],
    ECJ_URL: string = "http://www.eclipse.org/downloads/download.php?file=/eclipse/downloads/drops/R-3.7.1-201109091335/ecj-3.7.1.jar",
    JAZZLIB_URL: string = "http://downloads.sourceforge.net/project/jazzlib/jazzlib/0.07/jazzlib-binary-0.07-juz.zip",
    DOWNLOAD_URLS: string[] = [];

// Prepare DOWNLOAD_URLS prior to Grunt configuration.
DEBS.forEach(function(e) {
  DOWNLOAD_URLS.push(DEBS_DOMAIN + e);
});
DOWNLOAD_URLS.push(ECJ_URL);
DOWNLOAD_URLS.push(JAZZLIB_URL);

export function setup(grunt: IGrunt) {
  // Project configuration.
  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    // Calls path.resolve with the given arguments. If any argument is a
    // template, it is recursively processed until it no longer contains
    // templates.
    // Why do we need this? See:
    // http://stackoverflow.com/questions/21121239/grunt-how-do-recursive-templates-work
    resolve: function(...segs: string[]): string {
      var fixedSegs: string[] = [];
      segs.forEach(function(seg) {
        while (seg.indexOf('<%=') !== -1) {
          seg = <any> grunt.config.process(seg);
        }
        fixedSegs.push(seg);
      });
      return path.resolve.apply(path, fixedSegs);
    },
    // doppio build configuration
    build: {
      // Path to Java CLI utils. Will be updated by find_native_java_home task
      // if needed.
      java: 'java',
      javap: 'javap',
      javac: 'javac',
      doppio_dir: __dirname, // Root directory for doppio (same as this file)
      build_type: "",        // Build type for doppio (dev/dev-cli/etc.) Will be set by 'setup' task.
      vendor_dir: '<%= resolve(build.doppio_dir, "vendor") %>',
      jcl_dir: '<%= resolve(build.vendor_dir, "classes") %>',
      build_dir: '<%= resolve(build.doppio_dir, "build", build.build_type) %>',
      scratch_dir:  "/var/folders/_f/gq2b3cyd3qv8r4dl642488w80000gq/T/jdk-download84508",//resolve(os.tmpDir(), "jdk-download" + Math.floor(Math.random()*100000)),
    },
    make_build_dir: {
      options: { build_dir: "<%= build.build_dir %>" },
      // It's a multi-task, so you need a default target.
      default: {}
    },
    listings: { options: { output: "<%= resolve(build.build_dir, 'browser', 'listings.json') %>",
                           cwd: "<%= build.build_dir %>" },
                default: {}},
    'mini-rt': { options: { output: "<%= resolve(build.build_dir, 'browser', 'mini-rt.tar') %>",
                            run_class: 'classes/util/Javac',
                            run_args: ["./classes/test/FileOps.java"] },
                 default: {}},
    'ice-cream': {
      'release-cli': {
        files: [{
          expand: true,
          cwd: 'build/dev-cli',
          src: '+(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      }
    },
    launcher: {
      options: { src: '<%= resolve(build.build_dir, "console", "runner.js") %>' },
      'doppio-dev': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio-dev") %>' }
      },
      'doppio': {
        options: { dest: '<%= resolve(build.doppio_dir, "doppio") %>' }
      }
    },
    // Compiles TypeScript files.
    ts: {
      options: {
        sourcemap: true,
        comments: true
      },
      'dev-cli': {
        src: ["console/*.ts", "src/*.ts"],
        outDir: 'build/dev-cli',
        options: {
          module: 'commonjs'
        }
      },
      dev: {
        src: ["browser/frontend.ts", "src/*.ts"],
        outDir: 'build/dev',
        options: {
          module: 'amd'
        }
      }
    },
    // Downloads files.
    'curl-dir': {
      long: {
        src: DOWNLOAD_URLS,
        dest: "<%= build.scratch_dir %>"
      }
    },
    // Unzips files.
    unzip: {
      options: {
        dest_dir: '<%= build.jcl_dir %>'
      },
      jcl: {
        files: [{
          expand: true,
          src: "<%= resolve(build.scratch_dir, '**/+(rt|tools|resources|rhino|jsse).jar') %>"
        }]
      },
      ecj: {
        // We can't get the pathname from the URL, since it has an argument
        // in it that contains the actual filename.
        files: [{expand: true, src: "<%= resolve(build.scratch_dir, 'ecj*.jar') %>"}]
      },
      jazzlib: {
        options: {
          dest_dir: "<%= resolve(build.scratch_dir, 'jazzlib') %>"
        },
        files: [{src: "<%= resolve(build.scratch_dir, '" + path.basename(url.parse(JAZZLIB_URL).pathname) + "') %>"}]
      }
    },
    extract_deb: {
      default: {
        options: {
          dest_dir: "<%= build.scratch_dir %>"
        },
        files: [{
          expand: true,
          cwd: "<%= build.scratch_dir %>",
          src: "*.deb"
        }]
      }
    },
    uglify: {
      'release-cli': {
        warnings: false,
        unsafe: true,
        global_defs: {
          UNSAFE: true,
          RELEASE: true
        },
        files: [{
          expand: true,
          cwd: 'build/release-cli',
          src: '+(console|src)/*.js',
          dest: 'build/release-cli'
        }]
      }
    },
    copy: {
      jazzlib: {
        // Patches Jazzlib.
        files: [{
          expand: true,
          flatten: true,
          src: "<%= resolve(build.scratch_dir, 'jazzlib/java/util/zip/*.class') %>",
          dest: "<%= resolve(build.jcl_dir, 'java/util/zip') %>"
        }]
      },
      dev: {
        files: [{
          expand: true,
          src: ['browser/*.svg', 'browser/*.png', 'browser/*.js',
                'browser/core_viewer/*.css', 'browser/mini-rt.tar'],
          dest: 'build/dev'
        }, { expand: true, flatten: true, src: 'browser/core_viewer/*.html', dest: 'build/dev'}]
      }
    },
    javac: {
      default: {
        files: [{
          expand: true,
          src: 'classes/+(awt|demo|doppio|test|util)/*.java'
        }]
      }
    },
    javap: {
      default: {
        files: [{
          expand: true,
          src: 'classes/test/*.java',
          ext: '.disasm'
        }]
      }
    },
    run_java: {
      default: {
        expand: true,
        src: 'classes/test/*.java',
        ext: '.runout'
      }
    },
    render: {
      options: {
        secondary_file: "_navbar"
      },
      dev: {
        files: [{
          expand: true,
          flatten: true,
          src: "browser/!(_)*.mustache",
          dest: "<%= build.build_dir %>",
          ext: '.html'
        }]
      },
      release: {
        options: {
          args: ["--release"]
        },
        files: [{
          expand: true,
          flatten: true,
          src: "browser/[^_]*.mustache",
          dest: "<%= build.build_dir %>",
          ext: '.html'
        }]
      }
    },
    concat: {
      dev: {
        src: ['vendor/bootstrap/docs/assets/css/bootstrap.css', 'browser/style.css'],
        dest: 'build/dev/browser/style.css',
      },
      release: {
        src: ['vendor/bootstrap/docs/assets/css/bootstrap.css', 'browser/style.css'],
        dest: 'build/release/browser/style.css',
      }
    },
    coffee: {
      options: {
        sourcemap: true
      },
      dev: {
        files: {
          'build/dev/browser/core_viewer/core_viewer.js': 'browser/core_viewer/core_viewer.coffee'
        }
      },
      release: {
        files: {
          'build/release/browser/core_viewer/core_viewer.js': 'browser/core_viewer/core_viewer.coffee'
        }
      }
    }
	});

  grunt.registerMultiTask('launcher', 'Creates a launcher for the given CLI release.', function() {
    var launcherPath: string, exePath: string, options = this.options();
    launcherPath = options.dest;
    exePath = options.src;

    if (!fs.existsSync(launcherPath)) {
      try {
        // Write with mode 755.
        fs.writeFileSync(launcherPath, 'node $(dirname $0)/' + path.relative(path.dirname(launcherPath), exePath) + ' "$@"', {mode: 493});
        grunt.log.ok("Created launcher " + path.basename(launcherPath));
      } catch(e) {
        grunt.log.error("Could not create launcher " + path.basename(launcherPath) + ": " + e);
        return false;
      }
    }
  });

  // Provides TypeScript compiler functionality from within Grunt.
  grunt.loadNpmTasks('grunt-ts');
  // Provides minification.
  grunt.loadNpmTasks('grunt-contrib-uglify');
  grunt.loadNpmTasks('grunt-contrib-copy');
  grunt.loadNpmTasks('grunt-contrib-concat');
  grunt.loadNpmTasks('grunt-contrib-coffee');
  grunt.loadNpmTasks('grunt-curl');
  // Load our custom tasks.
  grunt.loadTasks('tasks');

  grunt.registerTask('setup', "Sets up doppio's environment prior to building.", function(build_type: string) {
    var need_jcl: boolean, need_ecj: boolean, need_jazzlib: boolean;
    if (build_type == null) {
      grunt.fail.fatal("setup build task needs to know the build type.");
    }
    // (Required) Sets the build_type so other directories can resolve properly.
    grunt.config.set('build.build_type', build_type);
    // (Required) Finds local installation of Java.
    grunt.task.run('find_native_java');
    need_jcl = !fs.existsSync('vendor/classes/java/lang/Object.class');
    need_ecj =!fs.existsSync('vendor/classes/org/eclipse/jdt/internal/compiler/batch/Main.class');
    need_jazzlib = !fs.existsSync('vendor/classes/java/util/zip/DeflaterEngine.class');
    if (need_jcl || need_ecj || need_jazzlib) {
      // Create download folder.
      try { fs.mkdirSync(grunt.config('build.scratch_dir')); } catch (e) { }
      // Schedule download task.
      // grunt.task.run('curl-dir');
    }
    if (need_jcl) {
      grunt.task.run('extract_deb');
      grunt.task.run('unzip:jcl');
    }
    if (need_ecj) {
      grunt.task.run('unzip:ecj');
    }
    if (need_jazzlib) {
      grunt.task.run('unzip:jazzlib');
      grunt.task.run('copy:jazzlib');
    }
    if (!fs.existsSync('vendor/java_home')) {
      grunt.task.run('setup_java_home');
    }
  });

  grunt.registerTask('dev-cli',
    ['setup:dev-cli',
     'make_build_dir',
     'ts:dev-cli',
     'launcher:doppio-dev']);
  grunt.registerTask('release-cli',
    ['dev-cli',
     // Do setup *after* dev-cli, as it has side effects (sets 'build.build_type').
     'setup:release-cli',
     'make_build_dir',
     'ice-cream:release-cli',
     'uglify:release-cli',
     'launcher:doppio']);
  /**
   * mini-rt.tar.gz <--  construct
   *   COPYFILE_DISABLE=true && tar -c -h -T <(sort -u tools/preload) -f $@
   */
  grunt.registerTask('java',
    ['javac',
     'javap',
     'run_java']);
  grunt.registerTask('dev',
    [// release-cli must run before setup:dev as it mutates build variables.
     'release-cli',
     'setup:dev',
     'java',
     'make_build_dir',
     'render:dev',
     'coffee:dev',
     'concat:dev',
     'mini-rt',
     'copy:dev',
     'listings',
     'ts:dev']);
  /**
   * release:
   * - build dev
   * - $(R_JS) -o browser/build.js
   * - $(R_JS) -o browser/build_frontend.js
   * Stuff with HTML
   * Stuff with favico
   * Stuff with mini-rt
   * Stuff with style.css
   * Copy over assets (SVG/PNG/etc)
   * Compile core-viewer
   *release: $(patsubst %,build/release/%,$(notdir $(BROWSER_HTML))) \
  build/release/doppio.js build/release/browser/frontend.js \
  build/release/favicon.ico build/release/browser/mini-rt.tar \
  build/release/browser/style.css
  rsync browser/*.svg browser/*.png build/release/browser/
  rsync browser/core_viewer/core_viewer.css build/release/browser/core_viewer/
  $(COFFEEC) -c -o build/release/browser/core_viewer browser/core_viewer/core_viewer.coffee
  cp browser/core_viewer.html build/release
  cd build/release; $(COFFEEC) $(DOPPIO_DIR)/tools/gen_dir_listings.coffee > browser/listings.json

   */
  grunt.registerTask('release',
    ['make_build_dir:release',
     'symlink:release']);
};