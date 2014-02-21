var path = require('path'); // File path processing. http://nodejs.org/api/path.html
var _ = require('lodash'); // Utilities. http://underscorejs.org/
var fs = require('node-fs'); // Recursive directory creation. https://github.com/bpedro/node-fs
var unzip = require('unzip'); // Extract zip files. https://github.com/nearinfinity/node-unzip
var winston = require('winston'); // Logging. https://github.com/flatiron/winston

var cu = require('./contentUpdater.js');
var ContentUpdater = cu.ContentUpdater;
var ContentFiles = cu.ContentFiles;
var ContentFile = cu.ContentFile;

// Like ContentUpdater except for a single file, which gets unzipped when it's done loading.
exports.AppUpdater = ContentUpdater.extend({

	defaults: _.extend(_.clone(ContentUpdater.prototype.defaults), {
		// The final local path for the app.
		local: 'app/',

		// The temp path for the app.
		temp: null
	}),

	// Download the new app to the temp folder.
	_doDownload: function(source) {

		var remote = this.get('remote')[source];
		var filename = path.basename(remote);
		var file = new ContentFile({
			url: remote,
			filePath: this.get('local')[source] + filename,
			tempPath: this.get('temp')[source] + filename
		});

		file.on('loaded', this._onFileLoaded, this);

		this.set('files', new ContentFiles());
		this.get('files').add(file);

		this._initDirectories(source, _.bind(function() {
			if (remote.indexOf('http') === 0) {
				// We're going to download a file from the web using the content updater logic.
				this._processFile(file);
			} else {
				// We're just going to copy a local file.
				this._robocopy(
					path.dirname(remote),
					path.dirname(path.resolve(file.get('tempPath'))),
					path.basename(remote),
					_.bind(function(code) {
						this.set('needsUpdate', code > 0 && code <= 8);
						this._callback(code > 8 ? code : 0);
						if (code > 8) {
							// Something bad happened.
							logger.error('Robocopy failed with code ' + code);
						}
					}, this));
			}
		}, this));
	},

	// Unzip any zip files.
	_onFileLoaded: function(contentFile) {
		if (!contentFile.get('totalBytes')) {
			// File was cached.
			ContentUpdater.prototype._onFileLoaded.call(this, contentFile);
			return;
		}

		if (path.extname(contentFile.get('url')).toUpperCase() != '.ZIP') {
			// Not a zip file.
			ContentUpdater.prototype._onFileLoaded.call(this, contentFile);
			return;
		}

		// Unzip the file.
		logger.info('Unzipping app. ' + contentFile.get('tempPath'));
		fs.createReadStream(
			contentFile.get('tempPath'))
			.pipe(unzip.Extract({
				path: path.dirname(contentFile.get('tempPath'))
			})).on('finish', _.bind(function(error) {
				this._handleError('Error unzipping app.', error);
				ContentUpdater.prototype._onFileLoaded.call(this, contentFile);
			}, this));
	}
});