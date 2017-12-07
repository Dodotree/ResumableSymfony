define([
  'jquery',
  'moment',
  'resumable'
], function ($, moment, r) {


FileUI.init();



    var FileUI = {
        init: function(){
          var panel_obj = FileUI.getUploadPanel();
          var holder =    FileUI.getUploadHolder();
          var panel = {
                'obj': panel_obj,
                'pause_btn':  panel_obj.find(".upload-panel-size"),
                'cancel_btn': panel_obj.find(".upload-panel-cancel"),
                'holders': [holder]
          };

          var uploadConfig = {  startImmediatelyBool: false,
                                panel:  panel,
                                getUploadNode:         FileUI.getUploadNode,
                                onUploadPanelChange:   FileUI.onUploadPanelChange,
                                onUploadStart:         FileUI.onUploadStart,
                                onUploadNodeProgress:  FileUI.onUploadNodeProgress,
                                onUploadPanelProgress: FileUI.onUploadPanelProgress,
                                toggleUploadPause:     FileUI.toggleUploadPause,
                                onHolderPause:         FileUI.onHolderPause,
                                preUpload:             FileUI.preUpload,
                                postNodeUpload:        FileUI.postNodeUpload,
                                postUpload:            FileUI.postUpload };
          var team_id = $('#post_team_id').val();
          var event_id = $('#post_event_id').val();
          var club_id = $('#post_club_id').val();
          var optionalParams = {type: 'image', team: team_id, club: club_id, event: event_id};
          FileUploader.init( uploadConfig, $('#browseButton'), $('.postRegion-button .btn'), holder, optionalParams );
          var optionalParams2 = {type: 'video', team: team_id, club: club_id, event: event_id};
          FileUploader.init( uploadConfig, $('#browseButton2'), $('.postRegion-button .btn'), holder, optionalParams2 );
        },

        preUpload: function(files){
            $.each(files, function(i, file){
                console.log(file);
                $.extend( file.optionalParams, {'text': $('#post_writeString').val()} );
                file.resetQuery();
            });
        return true;
        },

        postNodeUpload: function(node, reply, file){
            node.remove();
            if( 'undefined' != typeof(reply.successes) && 'undefined' != typeof(reply.successes.post) ){
                postings.addNewPost(reply.successes.post);    
            }
        },
        postUpload: function(panel){
            panel.obj.empty();
        },

        onUploadStart: function(panel){
            $.each(panel.holders, function(i, holder){
                holder.find('.upload').addClass('uploading');
            });
        },

        onUploadPanelProgress: function(panel, d){
            var total = panel.obj.find(".total-upload-node");
            total.find('.progress-bar-fill').width(d*100 +'%');
        },

        onUploadNodeProgress: function(node, d){
            node.find('.progress-bar-fill').width(d*100 +'%');
        },

        toggleUploadPause: function(node, pausedBool){
            node.toggleClass('paused', pausedBool);
        },
        onHolderPause: function(holder){
            holder.find('.upload').addClass('paused');
        },

        onUploadPanelChange: function( panel, files_length, tot_size, total_size_str ){
            var total = panel.obj.find(".upload-panel-totals");
            total.find('.upload-panel-size').html( total_size_str );
            //total.toggle( tot_size>0 && files_length>1 );
            panel.obj.toggleClass('filled', files_length>0);
        },

        getUploadNode: function(file_id, file_name, file_size){
            var item = $( '<div id="' + file_id + '" class="upload">'
                        + '<div class="progress-bar-fill"></div>'
                        + '<a class="upload-remove" href="#"><i class="icon-delete"></i></a>'
                        +  '<span class="upload-file-size">' + file_size + '</span>'
                        + '<span class="upload-file-name">'  + file_name + '</span>'
                        +'</div>');
            item.find('.progress-bar-fill').width(0 +'%');
            item[0].cancel_btn = item.find('.upload-remove');
        return item;
        },

        getUploadHolder: function(){
            return $(".files-holder").find(".upload-nodes-holder");
        },

        getUploadPanel: function(){
            var panel = $(".files-holder");
            panel.append('<div class="upload-panel-totals">'
                        + '<div class="progress-bar-fill"></div>'
                        + '<span class="upload-panel-size"></span>'
                        + '<a class="upload-panel-cancel" href="#">&times;</a>'
                        + '</div>'
                        +'<div class="upload-nodes-holder"></div>');
            return $(".files-holder");
        }
    };




    var FileUploader = {
        
        eventsBinded: false,

        bind: function(upload_btn, holder, pre_upload_callback){
            upload_btn.off('click').on('click', function(e){
                e.preventDefault();
                if( pre_upload_callback( r.files ) ){
                    r.upload();
                }
            });
        },
        bindNode: function(item, config){
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
                FileUploader.setPanelSize(config);
            });
        },
        bindPanel: function(panel){
            panel.pause_btn.off('click').on('click', function(e){
                e.preventDefault();
                r.pause(); 
            });
            panel.cancel_btn.off('click').on('click', function(e){
                e.preventDefault();
                r.cancel();
            });
        },
        setPanelSize: function(config){
            var tot_size = r.getSize();
            config.onUploadPanelChange( config.panel, r.files.length, tot_size,  r.formatSize(tot_size));
        },

        init: function( config, browse_button, upload_btn, holder, optionalParams ){ 
            if(!r.support){
                //console.log( 'hooray, nothing to do');
                return;
            }
            
            r.init({});
            r.assignBrowse(browse_button[0], optionalParams,  holder);

            FileUploader.bind(upload_btn, holder, config.preUpload);
            FileUploader.bindPanel(config.panel);

            // mostly DOM event
            r.on('fileAdded', function(file, event){
                console.debug('fileAdded', 'event > ', event);
            });

            // subscribe only once
            if( this.eventsBinded ){ return; }
            this.eventsBinded = true;

            // after files really registered 
            r.on('filesAdded', function(files){
                console.debug('filesAdded', 'array>', files.length, r.files.length);

                $.each( files, function(i, file){
                    if( $('#'+ file.uniqueIdentifier).length == 0 ){
                        var item = config.getUploadNode(file.uniqueIdentifier, file.fileName, r.formatSize( file.size ));
                        item[0].id = file.uniqueIdentifier;
                        item[0].file = file;
                        holder.append( item );
                        FileUploader.bindNode(item, config);
                    }
                });

                FileUploader.setPanelSize(config);

                if(  config.startImmediatelyBool ){
                    setTimeout( function(){
                        r.upload();
                    }, 300);
                }
            });

            r.on('uploadStart', function(){
                config.onUploadStart( config.panel );
            });
            r.on('progress', function(){ 
                //console.debug('progress'); 
                config.onUploadPanelProgress( config.panel, r.progress() );
            });
            r.on('fileProgress', function(file){ 
                //console.debug('fileProgress', file); 
                config.onUploadNodeProgress( $('#' + file.uniqueIdentifier), file.progress() );
            });
                
            r.on('fileSuccess', function(file, message){ 
                var reply = ('string' == typeof(message))? JSON.parse(message) : message; 
                config.postNodeUpload( $('#' + file.uniqueIdentifier), reply, file );
                FileUploader.setPanelSize(config);
            });
            r.on('fileRetry', function(file){          console.debug('fileRetry', file); });
            r.on('fileError', function(file, message){ 
                var reply = ('string' == typeof(message))? JSON.parse(message) : message; 
                config.postNodeUpload( $('#' + file.uniqueIdentifier), reply, file );
            });
            r.on('error', function(message, file){     
                console.debug('error', message, file); 
            });

            r.on('complete', function(){ /* all done */ 
                config.postUpload( config.panel );
            });
            r.on('pause', function(){ /*all files paused*/
                $.each( config.panel.holders, function(i,holder){
                    config.onHolderPause(holder);
                });
            });
            r.on('cancel', function(){ /* cancel all files */
                $.each( config.panel.holders, function(i,holder){
                    holder.empty();
                });
                FileUploader.setPanelSize(config);
            });
        }
    };



  // return FileUI;
});
