define([
  'jquery',
  'fileType'
], function($, checkFileType){

    // SUPPORTED BY BROWSER?
    // Check if these features are support by the browser:
    // - File object type
    // - Blob object type
    // - FileList object type
    // - slicing files


var Resumable = function(config){
    this.init(config);
};

var ResumableFile = function(file, context){
    this.init(file, context);
};

var ResumableChunk = function(fileObj, offset, context){
    this.init(fileObj, offset, context);
};

Resumable.prototype = {

    support: typeof(File)!=='undefined'
                   &&
             typeof(Blob)!=='undefined'
                   &&
             typeof(FileList)!=='undefined'
                   &&
             (!!Blob.prototype.webkitSlice||!!Blob.prototype.mozSlice||!!Blob.prototype.slice||false),

    round: $.noop,
    files: [],
    events: [],

    maxFiles: undefined,
    simultaneousUploads: 3,

    minFileSize: 1,
    maxFileSize: undefined,
        /* svg, obj, mtl can not be determinded by magic numbers, so we will have to rely on file extension */
    allowedFileTypes: ['jpg', 'png', 'gif', 'bmp', 'svg', 'tif', 'ico', 'mp4', 'webm', 'mov','avi', 'ogg', 'ogv', 'mpg', 'mp4', 'obj', 'mtl', 'pdf'],

    chunkSize: 1*1024*1024,
    forceChunkSize: false,
    prioritizeFirstAndLastChunk: false,
    chunkRetryInterval: undefined,
    maxChunkRetries: undefined,
    testChunks: true,


    slice: ( Blob.prototype.slice ? 'slice' : 
           ( Blob.prototype.mozSlice ? 'mozSlice' : 
           ( Blob.prototype.webkitSlice ? 'webkitSlice' : 'slice'))),
    target: '',
    query: {},
    headers: {},
    fileParameterName: 'file',
    throttleProgressCallbacks: 0.5,
    method: 'multipart',
    permanentErrors: [400, 404, 415, 500, 501],
    withCredentials: false,
    xhrTimeout: 0,

    maxFilesErrorCallback: function (files, set_param, errorCount) {
        var message = 'Please upload ' + set_param + ' file' + (set_param === 1 ? '' : 's') + ' at a time.';
        this.fire('error', null, message);
    },
    minFileSizeErrorCallback: function(file, set_param, errorCount) {
        var message = file.fileName||file.name +' is too small, please upload files larger than ' + this.formatSize(set_param) + '.';
        this.fire('error', {'name': file.fileName||file.name}, message);
    },
    maxFileSizeErrorCallback: function(file, set_param, errorCount) {
        var message = file.fileName||file.name +' is too large, please upload files less than ' + this.formatSize(set_param) + '.';
        this.fire('error', {'name': file.fileName||file.name}, message);
    },
    fileTypeErrorCallback: function(file, set_param, errorCount) {
        var message = file.fileName||file.name +' has type not allowed, please upload files of type ' + set_param.join(', ') + '.';
        this.fire('error', {'name': file.fileName||file.name}, message);
    },

    formatSize:function(size){
        if(size<1024) {
            return size + ' bytes';
        } else if(size<1024*1024) {
            return (size/1024.0).toFixed(0) + ' KB';
        } else if(size<1024*1024*1024) {
            return (size/1024.0/1024.0).toFixed(1) + ' MB';
        }
        return (size/1024.0/1024.0/1024.0).toFixed(1) + ' GB';
    },

    generateUniqueIdentifier:function(file, event){
        var custom = this.generateUniqueIdentifier;
        if(typeof(custom) === 'function') {
            return custom(file, event);
        }
        var relativePath = file.webkitRelativePath||file.fileName||file.name; // Some confusion in different versions of Firefox
        var size = file.size;
//console.log(relativePath, ' file identifier> ', size + '-' + relativePath.replace(/[^0-9a-zA-Z_-]/img, '') ); 
        return(size + '-' + relativePath.replace(/[^0-9a-zA-Z_-]/img, ''));
    },

    // EVENTS
    // catchAll(event, ...)
    // fileSuccess(file), fileProgress(file), fileAdded(file, event), fileRetry(file), fileError(file, message),
    // complete(), progress(), error(message, file), pause()
    on: function(event, callback){
        this.events.push(event.toLowerCase(), callback);
    },

    fire: function(){ // `arguments` is an object, not array, in FF, so:
        var args = [];
        for (var i=0; i<arguments.length; i++){ args.push(arguments[i]); }
        // Find event listeners, and support pseudo-event `catchAll`
        var event = args[0].toLowerCase();
        for (var i=0; i <= this.events.length; i+=2) {
            if( this.events[i] == event){      this.events[i+1].apply( this, args.slice(1)); }
            if( this.events[i] == 'catchall'){ this.events[i+1].apply( null, args); }
        }
        if(event=='fileerror'){    this.fire('error', args[2], args[1]);}
        if(event=='fileprogress'){ this.fire('progress'); }
    },


    init: function(opts){
        this.round = this.forceChunkSize ? Math.ceil : Math.floor;

        // making private collections
        this.files = [];
        this.events = [];

        // resumable options
        this.maxFiles = ('undefined' != typeof(opts.maxFiles))? opts.maxFiles: this.maxFiles;
        this.simultaneousUploads = ('undefined' != typeof(opts.simultaneousUploads))? opts.simultaneousUploads: this.simultaneousUploads;

        // defaults for inputs
        this.minFileSize = ('undefined' != typeof(opts.minFileSize))? opts.minFileSize: this.minFileSize;
        this.maxFileSize = ('undefined' != typeof(opts.maxFileSize))? opts.maxFileSize: this.maxFileSize;
        this.allowedFileTypes = ('undefined' != typeof(opts.allowedFileTypes) && null !== opts.allowedFileTypes)? 
                                    $.merge([], opts.allowedFileTypes) : this.allowedFileTypes; 
    },


    assignBrowse: function(btn_config){

        if(!btn_config.obj){ return; }
        if('undefined' ===  typeof(btn_config.obj.length)){ btn_config.obj = [btn_config.obj]; }

        btn_config.maxFiles = ('undefined' != typeof(btn_config.maxFiles))? btn_config.maxFiles: this.maxFiles;
        btn_config.minFileSize = ('undefined' != typeof(btn_config.minFileSize))? btn_config.minFileSize: this.minFileSize;
        btn_config.maxFileSize = ('undefined' != typeof(btn_config.maxFileSize))? btn_config.maxFileSize: this.maxFileSize;
        btn_config.allowedFileTypes = ('undefined' != typeof(btn_config.allowedFileTypes) && btn_config.allowedFileTypes)? $.merge([], btn_config.allowedFileTypes) : this.allowedFileTypes; 

        var that = this;

        $.each(btn_config.obj, function(i, domNode){

            var input;
            if(domNode.tagName === 'INPUT' && domNode.type === 'file'){
                input = domNode;
            }else{
                input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.style.display = 'none';
                domNode.addEventListener('click', function(e){
                    if( e.target != this ){ return; }
                    input.style.opacity = 0;
                    input.style.display='block';
                    input.focus();
                    input.click();
                    input.style.display='none';
                }, false);
                domNode.appendChild(input);
            }

            if('undefined' === typeof( btn_config.maxFiles ) || btn_config.maxFiles!=1){
                input.setAttribute('multiple', 'multiple');
            }else{
                input.removeAttribute('multiple');
            }

            if(btn_config.isDirectory){
                input.setAttribute('webkitdirectory', 'webkitdirectory');
            }else{
                input.removeAttribute('webkitdirectory');
            }

            // When new files are added, simply append them to the overall list
            input.addEventListener('change', function(e){
console.log('on change');
                that.appendFilesFromFileList(e, e.target.files, btn_config);

                if ( that.clearInput ) { e.target.value = ''; }  /// ???

            }, false);

        });

    }, // end of assign Browse


    addFile: function(file, optionalParams,  holder, event){  // for manipulation from outside
        this.appendFilesFromFileList(event, [file], btn_config);
    },

    removeFile: function(file){
        for(var i = this.files.length - 1; i >= 0; i--) {
            if(this.files[i] === file) {
                this.files[i] = file = null;
                this.files.splice(i, 1);
            }
        }
    },

    getFromUniqueIdentifier: function(uniqueIdentifier){
        for(var i = 0; i < this.files.length; i++){
            if( this.files[i].uniqueIdentifier == uniqueIdentifier){ 
                return true; 
            }
        }
    return false;
    },


    appendFilesFromFileList: function(event, fileList, btn_config){
        // check for uploading too many files
        var errorCount = 0;

        if( 'undefined' !== typeof(btn_config.maxFiles) && btn_config.maxFiles < fileList.length + this.files.length ) {
            // if single-file upload, file is already added, and trying to add 1 new file, simply replace the already-added file 
            if( btn_config.maxFiles === 1 && this.files.length === 1 && fileList.length === 1 ) {
                this.removeFile( this.files[0] );
            } else {
                this.maxFilesErrorCallback(fileList, btn_config.maxFiles, errorCount++);
                return false;
            }
        }

        var files = [];
        var that = this;

        $.each( fileList, function(i, file){

            // directories have size == 0
            if ( 'undefined' !== typeof(btn_config.minFileSize) && file.size < btn_config.minFileSize) {
                that.minFileSizeErrorCallback(file, btn_config.minFileSize, errorCount++);
                return false;
            }

            if ( 'undefined' !== typeof(btn_config.maxFileSize) && file.size > btn_config.maxFileSize) {
                that.maxFileSizeErrorCallback(file, btn_config.maxFileSize, errorCount++);
                return false;
            }

            var reader = new FileReader();    // Create instance of file reader. It is asynchronous!
            var file_slice = file[ that.slice ](0, 4 + 4096);
            reader.onload = function(e) {
                var slice_buf = reader.result;
                var fileType = checkFileType( slice_buf );
                // .obj and .mtl will return null
                var fileName = file.name.split('.'); 
                var dot_extension = fileName[fileName.length-1].toLowerCase();
                var extension = (fileType)? fileType.ext : dot_extension;

                if ( $.inArray(extension, btn_config.allowedFileTypes) == -1 ) {
                    that.fileTypeErrorCallback(file, btn_config.allowedFileTypes, errorCount++);
                    return false;
                }

                /// closure with timeout 0 to open File process
                if( !that.getFromUniqueIdentifier( that.generateUniqueIdentifier(file) )) {
                    (function(){
                        var FO = new ResumableFile( file, that ); // FO - file object, gets file and context
                        FO.mimeType = fileType;
                        FO.extension = extension;
                        FO.optionalParams = $.extend( {}, btn_config.optionalParams ); 
                        FO.holder = btn_config.holder;
                        window.setTimeout(function(){
                            that.files.push(FO);
                            files.push(FO);
                            // FO.container = (typeof event != 'undefined' ? event.srcElement : null);
                            that.fire('fileAdded', FO, event);
                            if( i+1 == fileList.length ){
                                window.setTimeout(function(){
                                    that.fire('filesAdded', that.files)
                                },0);
                            }
                        },0);
                    })();
                }
            }
            reader.readAsArrayBuffer(file_slice);
        });
    },


    uploadNextChunk: function(){
        var found = false;
        // In some cases (such as videos) it's really handy to upload the first
        // and last chunk of a file quickly; this let's the server check the file's
        // metadata and determine if there's even a point in continuing.
        if (this.prioritizeFirstAndLastChunk) {
            for(var i=0, file=this.files[0]; i < this.files.length; i++, file=this.files[i]){
                if( file.chunks.length && file.chunks[0].status() == 'pending' ) {
                    file.chunks[0].send();
                    return true;
                }
                if( file.chunks.length>1 && file.chunks[file.chunks.length-1].status()=='pending' ) {
                    file.chunks[file.chunks.length-1].send();
                    return true;
                }
            }
        }

        // Now, simply look for the next, best thing to upload
        for(var i=0, file=this.files[0]; i < this.files.length; i++, file=this.files[i]){
            if( false === file.isPaused()){
                for(var ii=0, chunk=file.chunks[0]; ii < file.chunks.length; ii++, chunk = file.chunks[ii]){
                    if(chunk.status()=='pending') {
                        chunk.send();
                        return true;
                    }
                }
            }
        }

        // The are no more outstanding chunks to upload, check is everything is done
        var outstanding = false;
        for(var i=0, file=this.files[0]; i < this.files.length; i++, file=this.files[i]){
            if(!file.isComplete()) {
              outstanding = true;
            }
        }
        if(!outstanding) { // All chunks have been uploaded, complete
            this.fire('complete');
            this.files.length = 0;
        }
      return false;
    },

    isUploading: function(){
        for(var i=0, file=this.files[0]; i < this.files.length; i++, file=this.files[i]){
            if (file.isUploading()) {
                return true;
            }
        }
    return false;
    },

    progress: function(){
        var totalDone = 0;
        var totalSize = 0;
        // Resume all chunks currently being uploaded
        $.each( this.files, function(i, file){
            totalDone += file.progress()*file.size;
            totalSize += file.size;
        });
        return (totalSize > 0) ? totalDone/totalSize : 0;
    },

    upload: function(){
        // Make sure we don't start too many uploads at once
        if( this.isUploading() ){ return; }
        // Kick off the queue
        this.fire('uploadStart');
        for (var num = 0; num < this.simultaneousUploads; num++) {
            this.uploadNextChunk();
        }
    },

    pause: function(){ // external
        // Resume all chunks currently being uploaded
        $.each( this.files, function(i, file){
            file.abort();
        });
        this.fire('pause');
    },

    cancel: function(){ // external
        for(var i = this.files.length - 1; i >= 0; i--) {
            this.files[i].cancel();
        }
        this.fire('cancel');
        this.files.length = 0; 
    },

    getSize: function(){ // external?
        var totalSize = 0;
        $.each( this.files, function(i, file){ totalSize += file.size; });
        return(totalSize);
    }

};


ResumableFile.prototype = {
    file: {},
    fileName: '', 
    size: 0,
    relativePath: '',
    uniqueIdentifier: '',
    _prevProgress: 0,
    _pause: false,
    _error: false,
    maxOffset: 1,

    init: function(file, context){
        this.context = context;
        this.file = file;
        this.fileName = file.fileName||file.name; // Some confusion in different versions of Firefox
        this.relativePath = file.webkitRelativePath || file.relativePath || this.fileName;
        this.size = file.size,
        this.uniqueIdentifier = context.generateUniqueIdentifier(file);

        context.fire('chunkingStart', this);
        this.bootstrap();
    },

    
    bootstrap: function(){
        this.abort();

        this._error = false;
        this._prevProgress = 0;
        this.chunks = [];
        this.maxOffset = Math.max( this.context.round( this.file.size/this.context.chunkSize ), 1);

        var FO = this;
        var that = this;

        for (var offset=0; offset < FO.maxOffset; offset++) {
            // very closed closure with timeout 0
            (function(offset){
                window.setTimeout(function(){
                    FO.chunks.push(new ResumableChunk(FO, offset, that.context));
                    that.context.fire('chunkingProgress', FO, offset/FO.maxOffset);
                },0);
            })(offset)
        }
        window.setTimeout(function(){ 
            that.context.fire('chunkingComplete', FO); 
        },0);
    },

    resetQuery: function(){
console.log('resetting', this.fileName);
        $.each(this.chunks, function(i,chunk){
            chunk.setQuery();
        });
    },

    abort: function(){ // Stop current uploads
        if('undefined' == typeof(this.chunks)){ return; }
        var abortCount = 0;
        for(var i=0, chunk=this.chunks[0]; i < this.chunks.length; i++, chunk=this.chunks[i]){
            if(chunk.status() == 'uploading') {
                chunk.abort();
                abortCount++;
            }
        }
        if(abortCount > 0){
            this.context.fire('fileProgress', this);
        }
    },

    cancel: function(){ // Reset this file to be void
        var _chunks = this.chunks;
        this.chunks = []; // Stop current uploads
        for(var i=0, chunk=_chunks[0]; i < _chunks.length; i++, chunk=_chunks[i]){
            if(chunk.status() == 'uploading')  {
                chunk.abort();
                this.context.uploadNextChunk();
            }
        }
        this.context.fire('fileProgress', this);
        this.context.removeFile(this);
    },

    retry: function(){
        this.bootstrap();
        var firedRetry = false;
        this.context.on('chunkingComplete', function(){
            if(!firedRetry){ 
                this.context.upload(); 
                firedRetry = true;
            }
        });
    },

    progress: function(){
        if(this._error) return(1); 
        var ret = 0;
        var error = false;
        for(var i=0, chunk=this.chunks[0]; i < this.chunks.length; i++, chunk=this.chunks[i]){
          if(chunk.status() == 'error'){ 
            //error = true; 
          }
          ret += chunk.rel_progress(); // get chunk progress relative to entire file
        }
        ret = (error) ? 1 : ((ret>0.99999)? 1 : ret);
        ret = Math.max(this._prevProgress, ret); // We don't want to lose percentages when an upload is paused
        this._prevProgress = ret;
        return(ret);
    },

    isUploading: function(){
        for(var i=0, chunk=this.chunks[0]; i < this.chunks.length; i++, chunk=this.chunks[i]){
          if(chunk.status()=='uploading') {
            return true;
          }
        }
        return false;
    },

    isComplete: function(){
        for(var i=0, chunk=this.chunks[0]; i < this.chunks.length; i++, chunk=this.chunks[i]){
            var status = chunk.status();
            if(status=='pending' || status=='uploading') {
                return false;
            }
        }
        return true;
    },

    pause: function(pauseBool){ // toggle or set if defined, not clear when it's used
        if('undefined' ===  typeof(pauseBool)){
            this._pause = (this._pause) ? false : true;
        }else{
            this._pause = pauseBool;
        }
    },

    isPaused: function() { return this._pause; }
};


ResumableChunk.prototype = {
/*    FO: {},
    offset: 0,
    startByte: 0, 
    endByte: 0,

    xhr: null,
    loaded: 0,    // filled by progress callback
    lastProgressTime: (new Date), // timestamp
    tested: false,
    retries: 0,
    pendingRetry: false, */

    init: function(fileObj, offset, context){
        this.context = context;
        this.FO = fileObj;
        this.offset = offset;
        this.xhr = null;

        this.lastProgressTime= (new Date);
        this.loaded = 0;
        this.retries = 0;
        this.tested = false;
        this.pendingRetry = false;

        var chunkSize = context.chunkSize;
        this.startByte = offset*chunkSize;
        this.endByte = Math.min(this.FO.size, (offset+1)*chunkSize);
        if(this.FO.size - this.endByte < chunkSize   && !this.context.forceChunkSize){
            this.endByte = this.FO.size; 
        }
        this.weight = this.endByte - this.startByte;
        this.rel_weight = this.weight/this.FO.size;

        this.retryInterval = ('undefined' === typeof(this.context.chunkRetryInterval))? 0 : this.context.chunkRetryInterval;
        this.setQuery();
//console.log('query>>', this.query);
    },


    setQuery: function(){
        // Set up the basic query data from Resumable
        var query = {
          resumableChunkSize:   this.context.chunkSize,
          resumableTotalSize:   this.FO.size,
          resumableType:        (this.FO.mimeType)? this.FO.mimeType.mime : '', 
          resumableExt:         this.FO.extension, 
          resumableIdentifier:  this.FO.uniqueIdentifier,
          resumableFilename:    this.FO.fileName,
          resumableRelativePath:this.FO.relativePath,

          resumableChunkNumber:      this.offset + 1, // current?
          resumableCurrentChunkSize: this.endByte - this.startByte,
          chunkStartByte: this.startByte,
          chunkEndByte:   this.endByte,
          resumableTotalChunks:      this.FO.maxOffset
        };
console.log( 'setQuery', this.FO.fileName, this.FO.optionalParams);
        $.each( this.FO.optionalParams, function(k, val){
            var param_name = 'param[' + k + ']';
            query[ param_name ] = val;
        });

        this.query =  query;
    },


    message: function(){
        return (this.xhr)? this.xhr.responseText : '';
    },

    abort: function(){ // Abort and reset
        if(!this.xhr){ return; }
        this.xhr.abort();
        this.xhr = null;
    },

    rel_progress: function(){ /// relative, not absolute
        var status = this.status();
        if(this.pendingRetry || status == 'pending'){
            return 0;
        }else if( status == 'success' || status == 'error' ){
            return this.rel_weight;
        }
      return this.loaded/this.FO.size;
    },

    chunkEvent: function(event, message){
        if( event == 'progress'){
            this.context.fire('fileProgress', this.FO);
        }else if(  event == 'error' ){
            this.FO.abort();
            this.FO.chunks.length = 0;
            this.context.fire('fileError', this.FO, message);
            this.context.uploadNextChunk();
        }else if(  event == 'success' ){
            this.context.fire('fileProgress', this.FO);
            this.context.uploadNextChunk();
            if( this.FO.isComplete() ){
                this.context.fire('fileSuccess', this.FO, message);
            }
        }else if(  event == 'retry' ){
            this.context.fire('fileRetry', this.FO);
        }
    },

    status: function(){ // Returns: 'pending', 'uploading', 'success', 'error'
        if(!this.xhr) {
            return('pending');
        }else if(this.pendingRetry) {
            // if pending retry then that's effectively the same as actively uploading,
            // there might just be a slight delay before the retry starts
            return('uploading');
        } else if(this.xhr.readyState<4) {
            // Status is really 'OPENED', 'HEADERS_RECEIVED' or 'LOADING' - meaning that stuff is happening
            return('uploading');
        } else {

            if(this.xhr.status==200) { // HTTP 200, perfect

                // now check if reply contains any server side errors
                var reply = ('string' == typeof(this.xhr.responseText))? JSON.parse(this.xhr.responseText) : this.xhr.responseText; 
                if( 'undefined' === typeof(reply.errors) || 0 == reply.errors.length ){
                    return 'success';
                }

                return 'error';
            } else if($.inArray( this.xhr.status, this.context.permanentErrors) !=-1 || this.retries >= this.context.maxChunkRetries) {
                // HTTP 415/500/501, permanent error
                return('error');
            } else {
                // this should never happen, but we'll reset and queue a retry
                // a likely case for this would be 503 service unavailable
                this.abort();
                return('pending');
            }
        }
    }, 

    onXHRProgress: function(e){ //throttle in seconds
      if( (new Date) - this.lastProgressTime > this.context.throttleProgressCallbacks * 1000 ) { 
          this.chunkEvent('progress');
          this.lastProgressTime = (new Date);
      }
      this.loaded = e.loaded||0;
    },

    onXHRDone: function(e){
        var status = this.status();
        if(status=='success'||status=='error') {
            this.chunkEvent(status, this.message());
        } else {
            this.chunkEvent('retry', this.message());
            this.abort();
            this.retries++;
            this.pendingRetry = true;
            setTimeout(this.send, this.retryInterval);
        }
    },

    onTestXHRDone: function(e){

        this.tested = true;

        var status = this.status(); // status() here is our custom function
        if( status == 'success' ) { // reply was succesfull and with no errors
            this.chunkEvent(status, this.message());
        } else {
            this.send(); // no reply or no file, try to post it
        }
    }, 

    test: function(){
console.log('test', this.query);
        this.callServer( this.context.target + '?' + $.param( this.query ), 'GET', null, this.onTestXHRDone );
    },

    send: function(){
console.log('send');
        if(this.context.testChunks && !this.tested){
            this.test();
            return;
        }

        this.loaded = 0;
        this.pendingRetry = false;
        this.chunkEvent('progress');

        var bytes  = this.FO.file[ this.context.slice ]( this.startByte, this.endByte);
        var data   = null;
        var URL = this.context.target;

        if ( this.context.method === 'octet') { // Add data from the query options
            data = bytes;
            var paramsStr = $.param( this.query );
            URL += '?' + paramsStr;  // 'get' params for post???
        } else { // create form and fill it
            data = new FormData();
            data.append( this.context.fileParameterName, bytes); /// param being 'file'
            $.each( this.query, function(k,v){ data.append(k,v); });
        }

        this.callServer( URL, 'POST', data, this.onXHRDone );
    },

    callServer: function( URL, method, data, serv_callback ){
        this.xhr = new XMLHttpRequest();
        var that = this;
        if( method == 'POST' ){
            this.xhr.upload.addEventListener('progress', function(e){ that.onXHRProgress.call(that,e) }, false);
        }
        this.xhr.addEventListener('load',    function(e){ serv_callback.call(that,e) }, false);
        this.xhr.addEventListener('error',   function(e){ serv_callback.call(that,e) }, false);
        this.xhr.addEventListener('timeout', function(e){ serv_callback.call(that,e) }, false);

        this.xhr.open(method, URL);
        this.xhr.timeout = this.context.xhrTimeout;
        this.xhr.withCredentials = this.context.withCredentials;
console.log( 'headers ', this.context.headers );
        $.each( this.context.headers, function(k,v) { this.xhr.setRequestHeader(k, v); });
        this.xhr.send(data);
    }
};

return Resumable;
});

