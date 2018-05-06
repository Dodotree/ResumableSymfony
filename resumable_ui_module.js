define([
  'jquery',
  'resumable'
], function ($, Resumable) {


    var FileUploader = {
        
        bind: function(resumable, config, upload_btn, pre_upload_callback){
            upload_btn.off('click').on('click', function(e){
                e.preventDefault();
              
                if( resumable.files.length == 0 ){
                    config.noFilesUpload();
                }

                if( resumable.isUploading() ){
                    resumable.pause();
                    $.each(resumable.files, function(i, file){ file.holder.addClass('paused'); });
                }else if( pre_upload_callback( resumable.files ) ){
                    FileUploader.startUpload(resumable, config);
                }
            });
        },

        bindNode: function(resumable, item, config){
            item.on('click', function(e){
                e.preventDefault();
                var pauseBool = !item[0].file.isPaused();
                /* toggles pause automatically if no value provided, you can set true/false */
                item[0].file.pause(); 
                config.toggleUploadPause(item, pauseBool);
            });
            item[0].cancel_btn.off('click').on('click', function(e){
                e.preventDefault();
                item[0].file.cancel();
                item.remove();
                FileUploader.setPanelSize(resumable, config);
            });
        },

        bindPanel: function(resumable, panel){
            if( 'undefined' != typeof(panel.pause_btn) && panel.pause_btn ){
                panel.pause_btn.off('click').on('click', function(e){
                    e.preventDefault();
                    resumable.pause(); 
                });
            }
            if( 'undefined' != typeof(panel.pause_btn) && panel.cancel_btn ){
                panel.cancel_btn.off('click').on('click', function(e){
                    e.preventDefault();
                    resumable.cancel();
                });
            }
        },

        setPanelSize: function(resumable, config){
            var tot_size = resumable.getSize();
            config.panel.obj.toggle(resumable.files.length > 0);
            config.onUploadPanelChange( config.panel, resumable.files.length, tot_size,  
                                                      resumable.formatSize(tot_size));
        },

        startUpload: function(resumable, config){
            $.each(resumable.files, function(i, file){ file.holder.removeClass('paused').addClass('uploading'); });
            resumable.upload();
        },

        init: function( config, btn_configs, upload_btn ){ 
            var resumable_opts = ('undefined' != typeof(config.route) )? {'target':config.route} : {};
            var resumable = new Resumable(resumable_opts);

            if(!resumable.support){
                return;
            }

            if( 'undefined' == typeof(config.panel) || 'undefined' == typeof(config.panel.obj) ){
                console.log( "File Uploader: no panel provided");
                return;
            }
            if( 'undefined' == typeof(config.panel.holders) ){
                config.panel.holders = [config.panel.obj];
            }

            var callback_names = ["noFilesUpload", "getUploadNode", "onUploadPanelChange", "onUploadStart", 
                                  "onUploadNodeProgress", "onUploadPanelProgress",
                                  "toggleUploadPause", "onPanelPause", "postNodeUpload", "postUpload"];
            $.each(callback_names, function(i,n){
                if('undefined' == typeof(config[n])){
                    console.log( "File Uploader: No " + n + " function provided." );
                    config[n] = $.noop;
                }
            });
            if('undefined' == typeof(config.preUpload)){
                config.preUpload = function(){ return true; }
            }
            
            $.each(btn_configs, function(i, btn_config){
                resumable.assignBrowse(btn_config);
            });

            if( !config.startImmediatelyBool && 'undefined' != typeof(upload_btn) && upload_btn){
                FileUploader.bind(resumable, config, upload_btn, config.preUpload);
            }
            FileUploader.bindPanel(resumable, config.panel);
            FileUploader.setPanelSize(resumable, config);

            // mostly DOM event
            resumable.on('fileAdded', function(file, event){
                console.debug('fileAdded', 'event > ', event);
            });

            // after files really registered 
            resumable.on('filesAdded', function(files){
                console.debug('filesAdded', 'array>', files.length, resumable.files.length);

                $.each( files, function(i, file){
                    if( $('#'+ file.uniqueIdentifier).length == 0 ){
                        var item = config.getUploadNode(file.holder, file.file, file.uniqueIdentifier, file.fileName, 
                                                        file.extension, resumable.formatSize( file.size ));
                        item[0].id = file.uniqueIdentifier;
                        item[0].file = file;
                        file.holder.append( item );
                        FileUploader.bindNode(resumable, item, config);
                    }
                });

                FileUploader.setPanelSize(resumable, config);

                if(  config.startImmediatelyBool ){
                    setTimeout( function(){
                        FileUploader.startUpload(resumable, config);
                    }, 300);
                }
            });

            resumable.on('uploadStart', function(){
                config.onUploadStart( config.panel );
            });
            resumable.on('progress', function(){ 
                config.onUploadPanelProgress( config.panel, resumable.progress() );
            });
            resumable.on('fileProgress', function(file){ 
                //console.debug('fileProgress', file); 
                config.onUploadNodeProgress( $('#' + file.uniqueIdentifier), file.progress() );
            });
                
            resumable.on('fileSuccess', function(file, message){ 
                var reply = ('string' == typeof(message))? JSON.parse(message) : message; 
                config.postNodeUpload( $('#' + file.uniqueIdentifier), reply, file );
                FileUploader.setPanelSize(resumable, config);
            });
            resumable.on('fileRetry', function(file){          console.debug('fileRetry', file); });
            resumable.on('fileError', function(file, message){ 
                var reply = (message && 'string' == typeof(message))? JSON.parse(message) : message; 
                flashCard.add('danger', message);
                config.postNodeUpload( $('#' + file.uniqueIdentifier), reply, file );
            });
            resumable.on('error', function(file, message){     
                console.debug('error', message, file); 
                flashCard.add('danger', message);
            });

            resumable.on('complete', function(){ /* all done */ 
                config.postUpload( config.panel );
                $.each(config.panel.holders, function(i, holder){ holder.removeClass('paused uploading'); });
            });
            resumable.on('pause', function(){ /*all files paused*/
                config.onPanelPause(config.panel);
            });
            resumable.on('cancel', function(){ /* cancel all files */
                // it will never happen if you don't have cancel-all btn
                $.each( config.panel.holders, function(i,holder){ holder.empty(); });
                FileUploader.setPanelSize(resumable, config);
            });
        }
    };


    var flashCard = {
        dismiss: function(){
            var this_card = $(this);
            this_card.addClass( 'way-to-the-right' );
            setTimeout(function(){ this_card.remove(); }, 500 );
        },

        add: function( type, note ){
           var box = $('.flash-box');
           var card  = $(
             '<div class="flash-card way-below ' + type + '">\
                <div class="flash-card-icon"><i class="icon3-flash"></i></div>\
                <div class="flash-card-text">' + note + '</div>\
             </div>').appendTo( box );
           setTimeout(function(){ card.removeClass('way-below'); }, 100 );
           card.bind('click', flashCard.dismiss);
           setTimeout(function(){ card.fadeOut(600, function(){ card.remove(); }) }, 5000 );
        }
    };


  return FileUploader;
});
