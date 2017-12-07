define([
  'jquery'
], function($){

    // SUPPORTED BY BROWSER?
    // Check if these features are support by the browser:
    // - File object type
    // - Blob object type
    // - FileList object type
    // - slicing files


var ResumableFile = function(file){
    this.init(file);
};

var ResumableChunk = function(fileObj, offset){
    this.init(fileObj, offset);
};

var Resumable = {

    support: typeof(File)!=='undefined'
                   &&
             typeof(Blob)!=='undefined'
                   &&
             typeof(FileList)!=='undefined'
                   &&
             (!!Blob.prototype.webkitSlice||!!Blob.prototype.mozSlice||!!Blob.prototype.slice||false),

    files: [],
    events: [],

    maxFiles: undefined,
    minFileSize: 1,
    maxFileSize: undefined,
    fileType: [],
    generateUniqueIdentifier: null,

    chunkSize: 1*1024*1024,
    forceChunkSize: false,
    prioritizeFirstAndLastChunk: false,
    chunkRetryInterval: undefined,
    maxChunkRetries: undefined,
    testChunks: true,
    simultaneousUploads: 3,

    round: function(){},
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

    maxFilesErrorCallback: function (files, errorCount) {
        var maxFiles = this.maxFiles;
        alert('Please upload ' + maxFiles + ' file' + (maxFiles === 1 ? '' : 's') + ' at a time.');
    },
    minFileSizeErrorCallback: function(file, errorCount) {
        alert(file.fileName||file.name +' is too small, please upload files larger than ' + this.formatSize( this.minFileSize ) + '.');
    },
    maxFileSizeErrorCallback: function(file, errorCount) {
        alert(file.fileName||file.name +' is too large, please upload files less than ' + this.formatSize( this.maxFileSize ) + '.');
    },
    fileTypeErrorCallback: function(file, errorCount) {
        alert(file.fileName||file.name +' has type not allowed, please upload files of type ' + this.fileType + '.');
    },

    init: function(opts){
        this.round = Resumable.forceChunkSize ? Math.ceil : Math.floor;
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
console.log(this.events.length);
        callback.identity = "aaaaaa";
        this.events.push(event.toLowerCase(), callback);
    },

    fire: function(){ // `arguments` is an object, not array, in FF, so:
        var args = [];
        for (var i=0; i<arguments.length; i++){ args.push(arguments[i]); }
        // Find event listeners, and support pseudo-event `catchAll`
        var event = args[0].toLowerCase();
console.log(this.events);
        for (var i=0; i <= this.events.length; i+=2) {
            if( this.events[i] == event){      this.events[i+1].apply( this, args.slice(1)); }
            if( this.events[i] == 'catchall'){ this.events[i+1].apply( null, args); }
        }
        if(event=='fileerror'){    Resumable.fire('error', args[2], args[1]);}
        if(event=='fileprogress'){ Resumable.fire('progress'); }
    },


    assignBrowse: function(domNodes, optionalParams,  holder, isDirectory){

        if(!domNodes){ return; }
        if('undefined' ===  typeof(domNodes.length)){ domNodes = [domNodes]; }

        $.each(domNodes, function(i, domNode){

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

            if('undefined' === typeof( this.maxFiles ) || this.maxFiles!=1){
                input.setAttribute('multiple', 'multiple');
            }else{
                input.removeAttribute('multiple');
            }

            if(isDirectory){
                input.setAttribute('webkitdirectory', 'webkitdirectory');
            }else{
                input.removeAttribute('webkitdirectory');
            }

            // When new files are added, simply append them to the overall list
            input.addEventListener('change', function(e){
console.log('on change');
                Resumable.appendFilesFromFileList(e.target.files, optionalParams, holder, e);

                if ( Resumable.clearInput ) { e.target.value = ''; }  /// ???

            }, false);

        });

    }, // end of assign Browse


    addFile: function(file, optionalParams,  holder, event){
console.log('addFile');
        Resumable.appendFilesFromFileList([file], optionalParams, holder, event);
    },

    removeFile: function(file){
        for(var i = Resumable.files.length - 1; i >= 0; i--) {
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


    appendFilesFromFileList: function(fileList, optionalParams, holder, event){
        // check for uploading too many files
        var errorCount = 0;

        if( 'undefined' !== typeof(this.maxFiles) && this.maxFiles < fileList.length + this.files.length ) {
            // if single-file upload, file is already added, and trying to add 1 new file, simply replace the already-added file 
            if( this.maxFiles === 1 && this.files.length === 1 && fileList.length === 1 ) {
                this.removeFile( this.files[0] );
            } else {
                this.maxFilesErrorCallback(fileList, errorCount++);
                return false;
            }
        }

        var files = [];

        $.each( fileList, function(i, file){
console.log(file.name);

            var fileName = file.name.split('.'); 
            var fileType = fileName[fileName.length-1].toLowerCase();
            if ( !$.inArray( fileType, Resumable.fileType)) {
                Resumable.fileTypeErrorCallback(file, errorCount++);
                return false;
            }

            // directories have size == 0
            if ( 'undefined' !== typeof(Resumable.minFileSize) && file.size < Resumable.minFileSize) {
                Resumable.minFileSizeErrorCallback(file, errorCount++);
                return false;
            }

            if ( 'undefined' !== typeof(Resumable.maxFileSize) && file.size > Resumable.maxFileSize) {
                Resumable.maxFileSizeErrorCallback(file, errorCount++);
                return false;
            }

            /// closure with timeout 0 to open File process
            if( !Resumable.getFromUniqueIdentifier( Resumable.generateUniqueIdentifier(file) )) {
                (function(){
                    var FO = new ResumableFile( file ); // FO - file object
                    FO.optionalParams = optionalParams;
                    FO.holder = holder;
                    window.setTimeout(function(){
                        Resumable.files.push(FO);
                        files.push(FO);
                        // FO.container = (typeof event != 'undefined' ? event.srcElement : null);
console.log('************');
                        Resumable.fire('fileAdded', FO, event)
console.log('^^^^^^^^^^^^');

                    },0);
                })();
            }
        });

        window.setTimeout(function(){
            Resumable.fire('filesAdded', Resumable.files)
        },0);
    },


    uploadNextChunk: function(){
        var found = false;
        // In some cases (such as videos) it's really handy to upload the first
        // and last chunk of a file quickly; this let's the server check the file's
        // metadata and determine if there's even a point in continuing.
        if (Resumable.prioritizeFirstAndLastChunk) {
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

    init: function(file){
        this.file = file;
        this.fileName = file.fileName||file.name; // Some confusion in different versions of Firefox
        this.relativePath = file.webkitRelativePath || file.relativePath || this.fileName;
        this.size = file.size,
        this.uniqueIdentifier = Resumable.generateUniqueIdentifier(file);

        Resumable.fire('chunkingStart', this);
        this.bootstrap();
    },

    
    bootstrap: function(){
        this.abort();

        this._error = false;
        this._prevProgress = 0;
        this.chunks = [];
        this.maxOffset = Math.max( Resumable.round( this.file.size/Resumable.chunkSize ), 1);

        var FO = this;

        for (var offset=0; offset < FO.maxOffset; offset++) {
            // very closed closure with timeout 0
            (function(offset){
                window.setTimeout(function(){
                    FO.chunks.push(new ResumableChunk(FO, offset));
                    Resumable.fire('chunkingProgress', FO, offset/FO.maxOffset);
                },0);
            })(offset)
        }
        window.setTimeout(function(){ 
            Resumable.fire('chunkingComplete', FO); 
        },0);
    },

    resetQuery: function(){
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
            Resumable.fire('fileProgress', this);
        }
    },

    cancel: function(){ // Reset this file to be void
        var _chunks = this.chunks;
        this.chunks = []; // Stop current uploads
        for(var i=0, chunk=_chunks[0]; i < _chunks.length; i++, chunk=_chunks[i]){
            if(chunk.status() == 'uploading')  {
                chunk.abort();
                Resumable.uploadNextChunk();
            }
        }
        Resumable.fire('fileProgress', this);
        Resumable.removeFile(this);
    },

    retry: function(){
        this.bootstrap();
        var firedRetry = false;
        Resumable.on('chunkingComplete', function(){
            if(!firedRetry){ 
                Resumable.upload(); 
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

    init: function(fileObj, offset){
        this.FO = fileObj;
        this.offset = offset;
        this.xhr = null;

        this.lastProgressTime= (new Date);
        this.loaded = 0;
        this.retries = 0;
        this.tested = false;
        this.pendingRetry = false;

        var chunkSize = Resumable.chunkSize;
        this.startByte = offset*chunkSize;
        this.endByte = Math.min(this.FO.size, (offset+1)*chunkSize);
        if(this.FO.size - this.endByte < chunkSize   && !Resumable.forceChunkSize){
            this.endByte = this.FO.size; 
        }
        this.weight = this.endByte - this.startByte;
        this.rel_weight = this.weight/this.FO.size;

        this.retryInterval = ('undefined' === typeof(Resumable.chunkRetryInterval))? 0 : Resumable.chunkRetryInterval;
        this.query = this.setQuery();
    },


    setQuery: function(){
        // Set up the basic query data from Resumable
        var query = {
          resumableChunkSize:   Resumable.chunkSize,
          resumableTotalSize:   this.FO.size,
          resumableType:        this.FO.type, /// not used
          resumableIdentifier:  this.FO.uniqueIdentifier,
          resumableFilename:    this.FO.fileName,
          resumableRelativePath:this.FO.relativePath,

          resumableChunkNumber:      this.offset + 1, // current?
          resumableCurrentChunkSize: this.endByte - this.startByte,
          chunkStartByte: this.startByte,
          chunkEndByte:   this.endByte,
          resumableTotalChunks:      this.FO.maxOffset
        };
        $.each( this.FO.optionalParams, function(k, val){
            query[ "param[" + k + "]" ] = val;
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
            Resumable.fire('fileProgress', this.FO);
        }else if(  event == 'error' ){
            this.FO.abort();
            this.FO.chunks.length = 0;
            Resumable.fire('fileError', this.FO, message);
            Resumable.uploadNextChunk();
        }else if(  event == 'success' ){
            Resumable.fire('fileProgress', this.FO);
            Resumable.uploadNextChunk();
            if( this.FO.isComplete() ){
                Resumable.fire('fileSuccess', this.FO, message);
            }
        }else if(  event == 'retry' ){
            Resumable.fire('fileRetry', this.FO);
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
            } else if($.inArray( this.xhr.status, Resumable.permanentErrors) !=-1 || this.retries >= Resumable.maxChunkRetries) {
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
      if( (new Date) - this.lastProgressTime > Resumable.throttleProgressCallbacks * 1000 ) { 
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
        this.callServer( Resumable.target + '?' + $.param( this.query ), 'GET', null, this.onTestXHRDone );
    },

    send: function(){
        if(Resumable.testChunks && !this.tested){
            this.test();
            return;
        }

        this.loaded = 0;
        this.pendingRetry = false;
        this.chunkEvent('progress');

        var bytes  = this.FO.file[ Resumable.slice ]( this.startByte, this.endByte);
        var data   = null;
        var URL = Resumable.target;

        if ( Resumable.method === 'octet') { // Add data from the query options
            data = bytes;
            var paramsStr = $.param( this.query );
            URL += '?' + paramsStr;  // 'get' params for post???
        } else { // create form and fill it
            data = new FormData();
            data.append( Resumable.fileParameterName, bytes); /// param being 'file'
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
        this.xhr.timeout =  Resumable.xhrTimeout;
        this.xhr.withCredentials = Resumable.withCredentials;
        $.each( Resumable.headers, function(k,v) { this.xhr.setRequestHeader(k, v); });
        this.xhr.send(data);
    }
};

return Resumable;
});

