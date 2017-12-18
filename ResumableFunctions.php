<?php

namespace Museum\CollectionBundle\Functions;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\JsonResponse;

#use Symfony\Component\Serializer\Normalizer\DateTimeNormalizer;
#use Symfony\Component\Serializer\Serializer;

use Museum\CollectionBundle\Entity\Upload;

class ResumableFunctions
{
    public function __construct($em, $container){
        $this->em = $em;
        $this->container = $container;
    }

    public function jsonR( $arr ){
        // use self::jsonR  instead  of  $this->json
        $response = new JsonResponse();
        $response->setData($arr);
    return $response;
    }

    /**
     * This is the implementation of the server side part of
     * Resumable.js client script, which sends/uploads files
     * to a server in several chunks.
     *
     * The script receives the files in a standard way as if
     * the files were uploaded using standard HTML form (multipart).
     *
     * This PHP script stores all the chunks of a file in a temporary
     * directory (`temp`) with the extension `_part<#ChunkN>`. Once all
     * the parts have been uploaded, a final destination file is
     * being created from all the stored parts (appending one by one).
     *
     * @author Gregory Chris (http://online-php.com)
     * @email www.online.php@gmail.com
     *
     * @editor Bivek Joshi (http://www.bivekjoshi.com.np)
     * @email meetbivek@gmail.com

     * HEAVILY MODIFIED by Veny T
     */


    /**
     *
     * Logging operation - to a file (upload_log.txt) and to the stdout
     * @param string $str - the logging string
     */
    private function _log($str) {

        // log to the output
        $log_str = date('d.m.Y').": {$str}\r\n";

        // echo $log_str;

        // log to file
        if (($fp = fopen( __DIR__ . "/../../../../web/uploads/upload_log.txt", 'a+')) !== false) {
            fputs($fp, $log_str);
            fclose($fp);
        }
    }


    /**
     *
     * Delete a directory RECURSIVELY
     * @param string $dir - directory path
     * @link http://php.net/manual/en/function.rmdir.php
     */
    private function rrmdir($dir) {
        if (is_dir($dir)) {
            $objects = scandir($dir);
            foreach ($objects as $object) {
                if ($object != "." && $object != "..") {
                    if (filetype("$dir/$object") == "dir") {
                        self::rrmdir("$dir/$object");
                    } else {
                        unlink("$dir/$object");
                    }
                }
            }
            reset($objects);
            rmdir($dir);
        }
    }

    public function cleanUp($file_chunks_folder){
        // rename the temporary directory (to avoid access from other concurrent chunks uploads) and than delete it
        if (rename($file_chunks_folder, $file_chunks_folder.'_UNUSED')) {
            self::rrmdir($file_chunks_folder.'_UNUSED');
        } else {
            self::rrmdir($file_chunks_folder);
        }
    }

    public function resumableUpload(){
        $successes = array();
        $errors = array();
        $warnings = array();

        $identifier = ( isset($_POST['resumableIdentifier']) )?  trim($_POST['resumableIdentifier']) : '';
        $file_chunks_folder = __DIR__ . "/../../../../web/temp/$identifier";

        if (!is_dir($file_chunks_folder)) {
            mkdir($file_chunks_folder, 0777, true);
        }
        self::_log("Upload to $file_chunks_folder >>> " . is_dir($file_chunks_folder));

        // theory:
        $totalSize =   (isset($_POST['resumableTotalSize']) )?    (int)$_POST['resumableTotalSize'] : 0;
        $totalChunks = (isset($_POST['resumableTotalChunks']) )?  (int)$_POST['resumableTotalChunks'] : 0;

        // loop through files and move the chunks to a temporarily created directory
        if (!empty($_FILES)) foreach ($_FILES as $file) {
            $filename =  (isset($_POST['resumableFilename']) )?          trim($_POST['resumableFilename']) : '';
            $chunkInd =  (isset($_POST['resumableChunkNumber']) )?       trim($_POST['resumableChunkNumber']) : '';
            $chunkSize = (isset($_POST['resumableCurrentChunkSize']) )?  (int)$_POST['resumableCurrentChunkSize'] : 0;
            $startByte = (isset($_POST['chunkStartByte']) )?             trim($_POST['chunkStartByte']) : '';
            $endByte =   (isset($_POST['chunkEndByte']) )?               trim($_POST['chunkEndByte']) : '';
            $optionalParams =(isset($_POST['param']) )? $_POST['param'] : array('type'=>'');

            $chunk_file = "$file_chunks_folder/{$filename}.part{$chunkInd}";

            // check the error status
            if ($file['error'] != 0) {
                $errors[] = array( 'text'=>'File error', 'name'=>$filename, 'index'=>$chunkInd );
                self::_log("Error {$file['error']} in file $filename");
                continue;
            }

            // move the temporary file
            if (!move_uploaded_file($file['tmp_name'], $chunk_file)) {
                $errors[] = array( 'text'=>'Move error', 'name'=>$filename, 'index'=>$chunkInd );
                self::_log( "Error saving (move_uploaded_file) chunk $chunkSize for file $filename");
            }
        } // end of if foreach

        if( count($errors) == 0 ){
            $this->checkAllParts(   $file_chunks_folder,
                                    $filename,
                                    $totalSize,
                                    $totalChunks,
                                    $optionalParams,
                                    $successes, $errors, $warnings);
        }

    return self::jsonR(array('successes'=>$successes, 'errors'=>$errors, 'warnings' =>$warnings));
    }

    public function checkAllParts(  $file_chunks_folder,
                                    $filename,
                                    $totalSize,
                                    $totalChunks,
                                    $optionalParams,
                                    &$successes, &$errors, &$warnings){

        // reality: count all the parts of this file
        $parts = glob("$file_chunks_folder/*");
        $successes[] = count($parts)." of $totalChunks parts done so far in $file_chunks_folder";

        // check if all the parts present, and create the final destination file
        if( count($parts) == $totalChunks ){
            $loaded_size = 0;
            foreach($parts as $file) {
                $loaded_size += filesize($file);
            }
            if ($loaded_size >= $totalSize and $this->createFileFromChunks(
                                                    $file_chunks_folder,
                                                    $filename,
                                                    $totalSize,
                                                    $totalChunks,
                                                    $optionalParams,
                                                    $successes, $errors, $warnings)){
                $this->cleanUp($file_chunks_folder);
            }
        }
    }

    public function checkUpload(){
        $successes = array();
        $errors = array();
        $warnings = array();

        // standard identifiers is size_namejpg with extension dot removed
        $identifier = (isset($_GET['resumableIdentifier']) )?     trim($_GET['resumableIdentifier']) : '';
        $filename =   (isset($_GET['resumableFilename']) )?        trim($_GET['resumableFilename']) : '';
        $chunkInd =   (isset($_GET['resumableChunkNumber']) )?     trim($_GET['resumableChunkNumber']) : '';
        $chunkSize =  (isset($_GET['resumableCurrentChunkSize']))? (int)$_GET['resumableCurrentChunkSize'] : 0;
        $totalSize =  (isset($_GET['resumableTotalSize']) )?       (int)$_GET['resumableTotalSize'] : 0;
        $totalChunks =(isset($_GET['resumableTotalChunks']) )?    (int)$_GET['resumableTotalChunks'] : 0;
        $optionalParams =(isset($_GET['param']) )? $_GET['param'] : array('type'=>'');

        $file_chunks_folder = __DIR__ . "/../../../../web/temp/$identifier";
        $chunk_file = "$file_chunks_folder/{$filename}.part{$chunkInd}";

        self::_log("Status of $chunk_file >>> ".file_exists($chunk_file));

        // it might exist, but it could be wrong size
        if (file_exists($chunk_file) and filesize($chunk_file) == $chunkSize) {

            $this->checkAllParts(   $file_chunks_folder,
                                    $filename,
                                    $totalSize,
                                    $totalChunks,
                                    $optionalParams,
                                    $successes, $errors, $warnings);

            // confirm that this chunk is in place and not needed anymore
            $successes[] = array('index'=>$chunkInd);
            return self::jsonR(array('successes'=>$successes, 'errors'=>$errors, 'warnings' =>$warnings));
        }
        // don't have it yet
        return self::jsonR(array('errors'=>array(array('index'=>$chunkInd))));
    }


    

    /**
     *
     * Check if all the parts exist, and
     * gather all the parts of the file together
     * @param string $file_chunks_folder - the temporary directory holding all the parts of the file
     * @param string $fileName - the original file name
     * @param string $totalSize - original file size (in bytes)
     */
    private function createFileFromChunks($file_chunks_folder, $fileName, 
                                            $total_size, $total_chunks, 
                                            $optionalParams, &$successes, &$errors, &$warnings) {
        ///// Part 1. create file /////
        $info = pathinfo($fileName);
        $extension = strtolower($info['extension']);
        $extension = ( 'jpeg' == $extension )? 'jpg' :$extension;

        // depending on your directory structure find folder
        //  check if desired file name is taken in its folder
        $video_extensions = array('mp4','mov', 'webm', 'ogv', 'ogm', 'ogg', 'avi',
                                        'wmv', 'mpeg', 'mpg', '3gp', 'mkv', 'mts', 'flv');
        $is_video_type =  in_array($extension, $video_extensions);
        // leaving out for now 'psd','pdf' and raw camera 'raf','arf','arw','mrw' etc.
        $image_extensions = array('gif','jpg','jpeg','png','png8','bmp','bmp2','bmp3', 'ico','svg','tiff'); //'cr2'
        $is_image_type =  in_array($extension, $image_extensions);


        $dir = __DIR__ . "/../../../../web";
        $rel_path = ($is_video_type )? "uploads/videos" : "uploads/originals";

        // space in the name can create problems with image manipulation commands
        $orig_file_name = str_replace( array(' ','(', ')' ), '_',  $info['filename'] );
        $saveName = $this->getNextAvailableFilename( $dir, $rel_path, $orig_file_name, $extension, $errors );
        if( !$saveName ){ return false; }

        // set all names
        $thumbName = "{$saveName}_$extension.jpg"; // to save original extension in a thumb name
        $saveNameExt = "$saveName.$extension";
        $save_path = "$rel_path/$saveNameExt";
        $abs_path =  "$dir/$save_path";

        # self::_log("Create $saveNameExt from chunks");
        $fp = fopen($abs_path, 'w');

        if ($fp === false) {
            $errors[] = 'cannot create the destination file';
            self::_log('cannot create the destination file');
            return false;
        }

        for ($i=1; $i<=$total_chunks; $i++) {
            fwrite($fp, file_get_contents($file_chunks_folder.'/'.$fileName.'.part'.$i));
            #self::_log('writing chunk '.$i);
        }
        fclose($fp);
        $successes[] = "finalized file: $total_size /".filesize($save_path);
        $size = filesize($abs_path);
        $duration = null;
        ///// end of creating and moving original file /////

        ///// Part 2. create thumbs, video snapshots or decode videos /////

        #$video_extensions = array('mp4','mov', 'ogv','webm');
        if( $is_image_type ){
            $this->createThumbs($save_path, $thumbName, $errors);
            if(count($errors)>0){ return false; }
        }elseif( $is_video_type ){
            if( 'mov' == $extension ){
                $this->decodeMovToMP4($dir, $rel_path, $saveName, $save_path, $errors);
                if(count($errors)>0){ return false; }
                $extension = 'mp4';
                $saveNameExt = "$saveName.$extension";
                $save_path = "$rel_path/$saveNameExt";
                $size = filesize($dir/$save_path);
            }

            $InSeconds = $this->getVideoDuration($save_path);
            if(!$InSeconds or count($errors)>0){ return false; }
            $duration = 1000*$InSeconds;
            $halfPoint = round($InSeconds/2);

            $this->createVideoCaptureAndThumbs($halfPoint, $dir, $save_path, $orig_file_name."_".$extension, $thumbName, $errors);
            if(count($errors)>0){ return false; }
            
        }else{
            $warnings[] = "Not an image or recognizable video file, can not create a thumb";
            $thumbName = null;
        }


        ////// Part 3.  register uploaded file in db, etc. //////
        $upload = $this->setUpload($orig_file_name, $extension, $saveNameExt, $size, $thumbName, $optionalParams, $duration);

        ////// Part 4.  upload to 3rd parties if needed: youtube, etc. //////

        ////// Part 5. add or update any info to return to the front end //////
        $successes['upload'] = $upload->getData();

        return true;
    }


    private function getNextAvailableFilename( $dir, $rel_path, $orig_file_name, $extension, &$errors ){
        if( file_exists("$dir/$rel_path/$orig_file_name.$extension") ){
            $i=0;
            while(file_exists("$dir/$rel_path/{$orig_file_name}_".(++$i).".$extension") and $i<10000){}
            if( $i >= 10000 ){
                $errors[] = "Can not create unique name for saving file $orig_file_name.$extension";
                return false;
            }
        return $orig_file_name."_".$i;
        }
    return $orig_file_name;
    }


    private function createThumbs($save_path, $thumbName, &$errors){
        `convert $save_path -resize "112x112^" -gravity center -crop 112x112+0+0 +repage uploads/thumbs/$thumbName`;
        `convert $save_path -resize "165x230^" -gravity center -crop 165x230+0+0 +repage uploads/wallets/$thumbName`;
        if( !file_exists("uploads/thumbs/$thumbName") or filesize("uploads/thumbs/$thumbName") == 0 ){
            $errors[] = "Not able to create thumb for $save_path";
        } 
    }

    private function decodeMovToMP4($dir, $rel_path, &$saveName, $save_path, &$errors){
        $saveName_mp4 = $this->getNextAvailableFilename( $dir, $rel_path, $saveName, 'mp4', $errors );
        if(!$saveName_mp4){ return false; }
        $successes[] = `ffmpeg -i $save_path $rel_path/$saveName_mp4.mp4 -hide_banner`;
        if( !file_exists("$rel_path/$saveName_mp4.mp4") ) {
            $errors[] = "cannot create mp4 file for $saveName";
            self::_log("cannot create mp4 file for $saveName");
            return false;
        }
        unlink($save_path);
        $saveName = $saveName_mp4;
    }


    private function getVideoDuration($save_path){
        //Duration: 00:00:04.17, start: 0.000000, bitrate: 165 kb/s
        $currentVideoDuration =  shell_exec("ffmpeg -i $save_path 2>&1 | grep Duration");
        $actualDuration = substr($currentVideoDuration, 11, 12);
        $arrHMS = explode(":", $actualDuration);
        if( count($arrHMS) < 2 ) {
            $errors[] = "cannot measure duration of $save_path";
            self::_log("cannot measure duration of $save_path");
            return false;
        }
        $InSeconds = $arrHMS[2] + $arrHMS[1]*60 + $arrHMS[0]*3600;
    return $InSeconds;
    }


    private function createVideoCaptureAndThumbs($halfPoint, $dir, $save_path, $name, &$thumbName, &$errors){
        //ffmpeg -v -1 -vframes %S -i "%i" -vcodec pam -an -f rawvideo -y "%u.pam" 2> "%Z"  // how imagemagic does it
        $pngCaptureName = $this->getNextAvailableFilename( $dir, "uploads/originals", $name, 'png', $errors );
        $captureName =    $this->getNextAvailableFilename( $dir, "uploads/originals", $name, 'jpg', $errors );
        `ffmpeg -ss $halfPoint -i $save_path -vframes 1 -filter:v 'yadif,scale=420:270' uploads/originals/$pngCaptureName.png`;
        `convert uploads/originals/$pngCaptureName.png uploads/originals/$captureName.jpg`;

        unlink( "uploads/originals/$pngCaptureName.png" );

        $thumbName = "{$captureName}.jpg"; // to save original extension in a thumb name
        $this->createThumbs("uploads/originals/$captureName.jpg", $thumbName, $errors);
    }


    private function setUpload($orig_file_name, $extension, $saveNameExt, $size, $thumbName, $optionalParams, $duration){
        $em = $this->em;
        $user = $this->container->get('security.token_storage')->getToken()->getUser();

            $upload = new Upload();
            $upload->setUser( $user );
            $upload->setFileName(  $orig_file_name );
            $upload->setExtension( $extension );
            $upload->setFilePath(  $saveNameExt );
            $upload->setSize( $size );
            $upload->setThumbPath( $thumbName );
            $upload->setDuration($duration);

            if( isset($optionalParams['type']) ){

                $upload_type = $optionalParams['type'];

                if( 'background-global' == $upload_type && !$user->isAdmin() ){
                    $upload_type = 'background-user';
                }

                $upload->setType($upload_type);

                if(strpos($upload_type, 'sponsor') !== false and isset($optionalParams['sponsor_id'])
                    and $sponsor = $em->getRepository('MuseumCollectionBundle:Sponsor')->find((int)$optionalParams['sponsor_id'])){

                    if( 'sponsor-logo' == $upload_type ){
                        $sponsor->setLogo($upload);
                    }elseif( 'sponsor-splash' == $upload_type ){
                        $sponsor->setSplash($upload);
                    }elseif( 'sponsor-banner' == $upload_type ){
                        $sponsor->setBanner($upload);
                    }elseif( 'sponsor-footer' == $upload_type ){
                        $sponsor->setFooter($upload);
                    }
                    $em->persist($sponsor);
                }
            }
            $em->persist($upload);
            $em->flush();
    return $upload;
    }

}
