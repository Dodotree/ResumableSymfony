    var BackgroundFileUI = {
        init: function(){
            var holder =  $("#background-uploads-holder");

            var uploadConfig = {  startImmediatelyBool: true,
                                  panel:  {'obj': holder},
                                  getUploadNode:         BackgroundFileUI.getUploadNode,
                                  onUploadNodeProgress:  BackgroundFileUI.onUploadNodeProgress,
                                  toggleUploadPause:     BackgroundFileUI.toggleUploadPause,
                                  postNodeUpload:        BackgroundFileUI.postNodeUpload };

            var btn_config = {    'obj' : $('#browseButtonBG')[0],
                                  'holder': holder,
                                  //'minFileSize': 1,
                                  //'maxFileSize': 1239847198,
                                  'allowedFileTypes': ['jpg', 'jpeg', 'gif', 'png', 'bmp'],
                                  'optionalParams': {'type': 'background-global'},
                                  'isDirectory' : false };

            FileUploader2.init(uploadConfig, [btn_config], $('.upload-panel-totals'));
        },

        postNodeUpload: function(node, reply, file){
            node.remove();
            if( 'undefined' != typeof(reply.successes) && 'undefined' != typeof(reply.successes.upload) ){
                var o = reply.successes.upload;
                var turl = bootstrap.uploads_url + 'thumbs/' + o.thumb;
                var ourl = bootstrap.uploads_url + 'thumbs/' + o.name;
                $(".background-btns-holder").append('<a href="#" class="bg-btn" data-url="' + ourl + '">'
                      + '<img  title="' + o.name + '" alt="' + o.name + '" src="'   + turl + '" class="thumbnail">'
                   + '</a>');
            }
            Background.bind_btns();
        },
        onUploadNodeProgress: function(node, d){
            node.find('.progress-bar-fill').width(d*100 +'%');
        },
        toggleUploadPause: function(node, pausedBool){
            node.toggleClass('paused', pausedBool);
        },
        getUploadNode: function(holder, file, file_id, file_name, file_ext, file_size){
            var item = BackgroundFileUI.getPlainNode(file_id, file_name, file_size);
            BackgroundFileUI.getImageNode(item, file);
        return item;
        },
        getImageNode: function(item, file){
            var url =  window.URL.createObjectURL(file);
            var img = $('<div class="image-preview"><img class="thumbnail" src="' + url + '"></div>')
                        .prependTo(item);
            img[0].onload = function() {
                window.URL.revokeObjectURL(url);
            }
        },
        getPlainNode: function(file_id, file_name, file_size){
            var item = $( '<div class="upload-node">'
                        + '<a class="upload-remove" href="#"><i class="icon-trashcan"></i></a>'
                        + '<div id="' + file_id + '" class="upload">'
                            + '<span class="upload-file-name">'  + file_name + '</span> '
                            + '<span class="upload-file-size">' + file_size + '</span>'
                            + '<div class="progress-bar-fill"></div>'
                        +'</div></div>');
            item.find('.progress-bar-fill').width(0 +'%');
            item[0].cancel_btn = item.find('.upload-remove');
        return item;
        }
    };



    var ModelFileUI = {
        init: function(){

            var uploadConfig = {  startImmediatelyBool: true,
                                  panel:  {'obj': $(), holders: [$('.model-li-obj'),  $('.model-li-mtl'),  $('.model-li-skin'),  $('.model-li-pic')]},
                                  getUploadNode:         ModelFileUI.getUploadNode,
                                  onUploadNodeProgress:  ModelFileUI.onUploadNodeProgress,
                                  toggleUploadPause:     ModelFileUI.toggleUploadPause,
                                  postNodeUpload:        ModelFileUI.postNodeUpload };

            var obj_btn_config = {    'obj' : $('#browseButtonModelObj')[0],
                                  'maxFiles': 1,
                                  'holder':   $('.model-li-obj'),
                                  'allowedFileTypes': ['obj'],
                                  'optionalParams': {'type': 'object'},
                                  'isDirectory' : false };

            var mtl_btn_config = {    'obj' : $('#browseButtonModelMtl')[0],
                                  'maxFiles': 1,
                                  'holder':   $('.model-li-mtl'),
                                  'allowedFileTypes': ['mtl'],
                                  'optionalParams': {'type': 'material'},
                                  'isDirectory' : false };

            var skin_btn_config = {    'obj' : $('#browseButtonModelSkin')[0],
                                  'maxFiles': 1,
                                  'holder':    $('.model-li-skin'),
                                  'allowedFileTypes': ['jpg', 'jpeg', 'gif', 'png', 'bmp'],
                                  'optionalParams': {'type': 'skin'},
                                  'isDirectory' : false };

            var capture_btn_config = {'obj' : $('#browseButtonModelPic')[0],
                                  'maxFiles': 1,
                                  'holder':   $('.model-li-pic'),
                                  'allowedFileTypes': ['jpg', 'jpeg', 'gif', 'png', 'bmp'],
                                  'optionalParams': {'type': 'capture'},
                                  'isDirectory' : false };
            FileUploader2.init(uploadConfig, [obj_btn_config, mtl_btn_config, skin_btn_config, capture_btn_config], null);
        },

        postNodeUpload: function(node, reply, file){
            node.remove();
            if( file.holder.hasClass('model-li-skin') || file.holder.hasClass('model-li-pic') ){
                $('.image-preview-' + file.uniqueIdentifier).remove();
            }
            if( 'undefined' != typeof(reply.successes) && 'undefined' != typeof(reply.successes.upload) ){
                ModelPanel.addUpload( reply.successes.upload, null );
            }
        },
        onUploadNodeProgress: function(node, d){
            node.find('.progress-bar-fill').width(d*100 +'%');
        },
        toggleUploadPause: function(node, pausedBool){
            node.toggleClass('paused', pausedBool);
        },

        getUploadNode: function(holder, file, file_id, file_name, file_ext, file_size){
            var item = ModelFileUI.getPlainNode(file_id, file_name, file_size);
            if( holder.hasClass('model-li-skin') || holder.hasClass('model-li-pic') ){
                ModelFileUI.getImageNode($('.model-edit-panel .model-icon'), file, file_id);
            }
        return item;
        },
        getImageNode: function(holder, file, file_id){
            var url =  window.URL.createObjectURL(file);
            var img = $('<div class="image-preview image-preview-' + file_id
                        + '"><img class="thumbnail" src="' + url + '"></div>')
                            .appendTo(holder);
            img[0].onload = function() {
                window.URL.revokeObjectURL(url);
            }
        },
        getPlainNode: function(file_id, file_name, file_size){
            var item = $( '<div class="upload-node">'
                        + '<a class="upload-remove" href="#"><i class="icon-trashcan"></i></a>'
                        + '<div id="' + file_id + '" class="upload">'
                            + '<span class="upload-file-name">'  + file_name + '</span> '
                            + '<span class="upload-file-size">' + file_size + '</span>'
                            + '<div class="progress-bar-fill"></div>'
                        +'</div></div>');
            item.find('.progress-bar-fill').width(0 +'%');
            item[0].cancel_btn = item.find('.upload-remove');
        return item;
        }
    };


    var WallFileUI = {
        init: function(){
          var panel_obj = WallFileUI.getUploadPanel();
          var holder =    WallFileUI.getUploadHolder();
          var panel = {
                'obj': panel_obj,
                'pause_btn':  null, // set to null if you want upload and pause be on same button
                'cancel_btn': panel_obj.find(".upload-panel-cancel"),
                'holders': [holder]
          };

          var uploadConfig = {  startImmediatelyBool: false,
                                panel:  panel,
                                getUploadNode:         WallFileUI.getUploadNode,
                                onUploadPanelChange:   WallFileUI.onUploadPanelChange,
                                onUploadStart:         WallFileUI.onUploadStart,
                                onUploadNodeProgress:  WallFileUI.onUploadNodeProgress,
                                onUploadPanelProgress: WallFileUI.onUploadPanelProgress,
                                toggleUploadPause:     WallFileUI.toggleUploadPause,
                                onPanelPause:          WallFileUI.onPanelPause,
                                preUpload:             WallFileUI.preUpload,
                                postNodeUpload:        WallFileUI.postNodeUpload,
                                postUpload:            WallFileUI.postUpload };

          var btn_config = {    'obj' : $('#browseButton')[0],
                                'holder': holder,
                                //'minFileSize': 1,
                                //'maxFileSize': 1239847198,
                                'allowedFileTypes': null,
                                'optionalParams': {},
                                'isDirectory' : false };

          FileUploader2.init(uploadConfig, [btn_config], $('.upload-panel-totals'));
        },

        preUpload: function(files){
            $.each(files, function(i, file){
                var file_type = '';
                if( 'mtl' == file.extension ){
                    file_type = 'material';
                }else if( 'obj' == file.extension ){
                    file_type = 'object';
                }else if( $.inArray( file.extension, ['mp4', 'webm', 'ogm', 'ogg', 'ogv', 'mov', 'avi',
                                                'wmv', 'mpg', '3gp', 'mkv', 'mts', 'flv']) != -1 ){
                    file_type = 'video';
                }
                if( '' != file_type && 'undefined' == typeof(file.optionalParams['type']) ){
                    $.extend( file.optionalParams, {'type': file_type} );
                    file.resetQuery();
                }
            });
        return true;
        },

        postNodeUpload: function(node, reply, file){
            node.remove();
            if( 'undefined' != typeof(reply.successes) && 'undefined' != typeof(reply.successes.upload) ){
                //postings.addNewPost(reply.successes.upload);
            }
        },
        postUpload: function(panel){
            var total = panel.obj.find(".upload-panel-totals");
            total.find('.progress-bar-fill').width('0%');
            total.find('.upload-panel-size').html('0%');
            panel.obj.removeClass('filled');

            routing.reloadHard();
        },
        onUploadStart: function(panel){
            $.each(panel.holders, function(i, holder){
                holder.find('.upload').addClass('uploading');
            });
            panel.obj.find('.paused').removeClass('paused');
        },

        onUploadPanelProgress: function(panel, d){
            var total = panel.obj.find(".upload-panel-totals");
            total.find('.progress-bar-fill').width(d*100 +'%');
            total.find('.upload-panel-size').html(d*100 +'%');
        },
        onUploadNodeProgress: function(node, d){
            node.find('.progress-bar-fill').width(d*100 +'%');
        },
        toggleUploadPause: function(node, pausedBool){
            node.toggleClass('paused', pausedBool);
        },
        onPanelPause: function(panel){
            panel.obj.find(".upload-panel-totals").addClass("paused");
            panel.obj.find(".upload").addClass("paused");
        },
        onUploadPanelChange: function( panel, files_length, tot_size, total_size_str ){
            var total = panel.obj.find(".upload-panel-totals");
            total.find('.upload-panel-size').html( "Start upload (" + total_size_str +")");
            //total.toggle( tot_size>0 && files_length>1 );
            panel.obj.toggleClass('filled', files_length>0);
            total.find('.progress-bar-fill').width('0%');
        },

        getUploadNode: function(holder, file, file_id, file_name, file_ext, file_size){
            var item = WallFileUI.getPlainNode(file_id, file_name, file_size);
            if ($.inArray( file_ext, ['jpg', 'png', 'gif', 'bmp']) != -1){
                WallFileUI.getImageNode(item, file);
            } else if ($.inArray( file_ext, ['mp4', 'webm', 'ogg', 'ogv']) != -1){
                WallFileUI.getVideoNode(item, file);
            } else if('pdf' == file_ext) {
                WallFileUI.getPDFNode(item, file);
            }
        return item;
        },
        getImageNode: function(item, file){
            var url =  window.URL.createObjectURL(file);
            var img = $('<div class="image-preview"><img src="' + url + '"></div>')
                        .prependTo(item);
            img[0].onload = function() {
                window.URL.revokeObjectURL(url);
            }
        },

        getVideoNode: function(item, file){
            //var url =  window.URL.createObjectURL(file);
            var reader = new FileReader();
            reader.onload = function(e){
                var video = $('<div class="video-preview"><video width="240" controls src="' + e.target.result + '"></div>')
                        .prependTo(item);
                //video[0].play()
            };
            reader.readAsDataURL(file);
            //window.URL.revokeObjectURL(url);
        },
        getPDFNode: function(item, file){
            var obj_url = window.URL.createObjectURL(file);
            var pdf = $('<iframe id="viewer" scr="' + url + '">').prependTo(item);
            window.URL.revokeObjectURL(obj_url);
        },
        getPlainNode: function(file_id, file_name, file_size){
            var item = $( '<div class="upload-node">'
                        + '<a class="upload-remove" href="#"><i class="icon-trashcan"></i></a>'
                        + '<div id="' + file_id + '" class="upload">'
                            + '<span class="upload-file-name">'  + file_name + '</span> '
                            + '<span class="upload-file-size">' + file_size + '</span>'
                            + '<div class="progress-bar-fill"></div>'
                        +'</div></div>');
            item.find('.progress-bar-fill').width(0 +'%');
            item[0].cancel_btn = item.find('.upload-remove');
        return item;
        },

        getUploadHolder: function(){
            var panel = $("#file-uploads-holder");
            return panel.find(".upload-nodes-holder");
        },
        getUploadPanel: function(){
            var panel = $("#file-uploads-holder");
            panel.append('<div class="upload-panel-totals">'
                        + '<span class="upload-panel-size">Start upload</span>'
                        + '<div class="progress-bar-fill"></div>'
                        + '<a class="upload-panel-cancel" href="#">&times;</a>'
                        + '</div>'
                        +'<div class="upload-nodes-holder"></div>');
            return panel;
        }
    };


