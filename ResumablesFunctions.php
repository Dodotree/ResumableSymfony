<?php

namespace SportsRush\CoreBundle\Functions;

use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\JsonResponse;

#use Symfony\Component\Serializer\Normalizer\DateTimeNormalizer;
#use Symfony\Component\Serializer\Serializer;

use SportsRush\CoreBundle\Entity\Post;

class ResumablesFunctions
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

    public function baseURL(){
        $scheme = $_SERVER['REQUEST_SCHEME'];
        $host = $_SERVER['HTTP_HOST'];
        return "$scheme://$host/uploads/images/";
        #return 'http://nanobillion.com'.'/uploads/images/';
        #return 'http://www.sportsrush.com'.'/uploads/images/';
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
            } else {
                // reality: count all the parts of this file
                $parts = glob("$file_chunks_folder/*");
                $successes[] = count($parts)." of $totalChunks parts done so far";

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
        } // end of if foreach
    return self::jsonR(array('successes'=>$successes, 'errors'=>$errors, 'warnings' =>$warnings));
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

            // exception in case it was uploaded and exists, but failed to move from /tmp directory
            if( 1 == $totalChunks and $totalSize == $chunkSize ){
                self::_log("Attempting to finilize $chunk_file");
                if($this->createFileFromChunks(
                        $file_chunks_folder,
                        $filename,
                        $totalSize,
                        $totalChunks,
                        $optionalParams,
                        $successes, $errors, $warnings)){
                    $this->cleanUp($file_chunks_folder);
                }
                return self::jsonR(array('successes'=>$successes, 'errors'=>$errors, 'warnings' =>$warnings));
            }

            // confirm that this chunk is in place and not needed anymore
            return self::jsonR(array('successes'=>array(array('index'=>$chunkInd))));
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
        $info = pathinfo($fileName);
        $extension = strtolower($info['extension']);
        $extension = ( 'jpeg' == $extension )? 'jpg' :$extension;
        $is_video_type = ( isset($optionalParams['type']) and $optionalParams['type'] == 'video');

        // space in the name can create problems with image manipulation commands
        $saveName = str_replace( ' ', '_',  $info['filename'] );
        $orig_file_name = $saveName;

        $dir = __DIR__ . "/../../../../web";
        $rel_path = ($is_video_type )? "uploads/videos" : "uploads/images";

        if( file_exists("$dir/$rel_path/$fileName") ){
            $i=0;
            while(file_exists("$dir/$rel_path/{$saveName}_".(++$i).".$extension") and $i<10000){}
            if( $i >= 10000 ){
                $errors[] = "Can not create unique name for saving file $fileName, $saveName";
                return false;
            }else{
                $saveName = $saveName."_".$i;
            }
        }
        $thumbName = "{$saveName}_$extension.jpg";
        $saveNameExt = "$saveName.$extension";
        $save_path = "$rel_path/$saveNameExt";
        $abs_path = "$dir/$save_path";

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

            // thump works and snapshots
            $thumbs_bool = false;
            // leaving out for now 'psd','pdf','avi','mpeg' and raw camera 'raf','arf','arw','mrw' etc.
            $img_extensions = array('gif','jpg','jpeg','png','png8','bmp','bmp2','bmp3', 'ico','svg','tiff');
            $video_extensions = array('mp4','mov', 'ogv','webm');
            if( in_array($extension, $img_extensions) ){
                #`convert $save_path -resize "112x112^" -gravity center -crop 112x112+0+0 +repage uploads/thumbs/$thumbName`;
                #`convert $save_path -resize "165x230^" -gravity center -crop 165x230+0+0 +repage uploads/wallets/$thumbName`;
                $thumbs_bool = true;
            }elseif( in_array($extension, $video_extensions) ){
            }else{
                $warnings[] = "Not an image file, can not create a thumb";
            }
            // end of thumb works

        ///////////  register uploaded file in db, etc. ////////////
        $em = $this->em;
        $user = $this->container->get('security.token_storage')->getToken()->getUser();
        if( $is_video_type ){
            if( $slag = $this->youtubeUpload($em, $user, $saveNameExt, $rel_path,
                                                  $optionalParams, $successes, $errors, $warnings)){
                $successes['post'] = $this->setPost($em, $user, $optionalParams, null, $slag);
                return true;
            }
            return false;
        }
        // plain post
        $successes['post'] = $this->setPost($em, $user, $optionalParams, $saveNameExt, null);
        return true;
    }


    public function setPost($em, $user, $info, $img, $slag)
    {
        $post = new post();
        $post->setUser($user);
        $post->setWriteString( $info['text'] );
        if( $img and $img != '' ){ $post->setFilePath($img); }
        if( $slag and $slag != '' ){ $post->setYoutube($slag); }

        self::setNewPostOwners($em, $user, $info, $post);
        $em->persist($post);
        $em->flush();
        $this->sendNewPostNotifications($post, $em, $user);

        return $post->unwrapPost($this->baseURL());
    }


    public function sendNewPostNotifications($post, $em, $user)
    {
        $router = $this->container->get('router');
        if( $team = $post->getTeam() ){
            $team_url = $router->generate('sportsrush_core_main_teams-profile', array( 'id' => $team->getId() ));
        }
        if( $event = $post->getEvent() ){
            $codedId = $em->getRepository('SportsRushCoreBundle:Event')->generateUniqueUrl( $event->getId() );
            $event_url = $router->generate('sportsrush_core_main_events_detail', array( 'unique_url'=> $codedId));
        }
        if( isset( $event ) ){
            $title = $user->getUsername() . ' has posted to ' . $event->getName();
            $this->container->get('app.funcs.notifications')
                 ->setTeamTextNotifications( $em, $team, $title, $post->getWriteString(), $event_url, 'event' );
        }elseif( isset( $team ) ){
            $title = $user->getUsername() . ' has posted to ' . $team->getName();
            $this->container->get('app.funcs.notifications')
                 ->setTeamTextNotifications( $em, $team, $title, $post->getWriteString(), $team_url, 'team' );
        }
    }


    public function setNewPostOwners($em, $user, $info, &$post)
    {
        if( $info['club'] != '' ){
            $club = $em->getRepository('SportsRushCoreBundle:Club')->find( $info['club'] );
            if( $club ){
                $post->setClub($club);
            }
        }
        if( $info['team'] != '' ){ /* check if team member */
            $team = $em->getRepository('SportsRushCoreBundle:Team')->find( $info['team'] );
            if( $team and $team->getWordRole($user) != 'none' ){
                $post->setTeam($team);
                if( $team->getClub() ){
                    $post->setClub($team->getClub());
                }
            }
        }
        if( $info['event'] != '' ){ /* check if participant (invited was accepted) */
            $events_repo = $em->getRepository('SportsRushCoreBundle:Event');
            $event = $events_repo->find( $info['event'] );
            if( $event and $user->getEvents()->contains($event) ){
                $post->setEvent($event);
                $post->setTeam($event->getTeam());
                if( $event->getTeam()->getClub() ){
                    $post->setClub($event->getTeam()->getClub());
                }
            }
        }
    }


    public function youtubeUpload($em, $user, $filename, $rel_path, $optionalParams, &$successes, &$errors, &$warnings)
    {
        $dir = __DIR__ . "/../../../../web";
        $abs_path = "$dir/$rel_path/$filename";

        if( !file_exists($abs_path) ){ 
            return false; 
        }

        $token = $this->container->get('security.token_storage')->getToken();
        $google_app_id = $this->container->getParameter('google_app_id');
        $google_app_secret = $this->container->getParameter('google_app_secret');
        $refresh_token = $user->getGoogleRefreshToken();

        $client = new \Google_Client();
        $client->setApplicationName("SportsRush");
        $client->setClientId($google_app_id);
        $client->setClientSecret($google_app_secret);
        // Define an object that will be used to make all API requests.

        if( method_exists( $token, 'getResourceOwnerName' ) and $token->getResourceOwnerName() == 'google' ){
            // already logged in with google
            $client->setAccessToken(json_encode($token->getRawToken()));
        }elseif( !is_null($refresh_token) ){
            $client->setAccessType('offline');
            $client->refreshToken($refresh_token);
        }else{
            // if no refresh token were provided
            $resourse_owner = ( method_exists( $token, 'getResourceOwnerName' ) )?  $token->getResourceOwnerName() : 'SportsRush';
            $errors['Authentication provider error'] = 'Please, login with your google account, not your ' . $resourse_owner . " account.";
        return false;
        }

        // Check to ensure that the access token was successfully acquired.
        if ( !$client->getAccessToken()) {
            $errors['Google authentication error'] = 'can not get access token';
        return false;
        }

        try {
            $youtube = new \Google_Service_YouTube($client);
            //$channelsResponse = $youtube->channels->listChannels('contentDetails', array( 'mine' => 'true',));
            //var_dump( $channelsResponse['items'] );

            $snippet = new \Google_Service_YouTube_VideoSnippet();
            $snippet->setTitle($filename);
            $descr = isset($optionalParams['text'])? $optionalParams['text']: '';
            $snippet->setDescription( $descr );
            $snippet->setTags(array("tag1", "tag2"));
            $snippet->setCategoryId("22");

            $status = new \Google_Service_YouTube_VideoStatus();
            $status->privacyStatus = "public";

            $video = new \Google_Service_YouTube_Video();
            $video->setSnippet($snippet);
            $video->setStatus($status);

            $chunkSizeBytes = 1 * 1024 * 1024;
            $client->setDefer(true);
            $insertRequest = $youtube->videos->insert("status,snippet", $video);
            $media = new \Google_Http_MediaFileUpload( $client, $insertRequest, 'video/*', null, true, $chunkSizeBytes);
            $media->setFileSize(filesize($abs_path));

            $status = false;
            $handle = fopen($abs_path, "rb");
            while (!$status && !feof($handle)) {
                $chunk = fread($handle, $chunkSizeBytes);
                $status = $media->nextChunk($chunk);
            }
            fclose($handle);
            return  $status['id'];

        } catch (\Google_Service_Exception $e) {
            $errors['google api service error'] = json_decode($e->getMessage(), true);
            return false;
        } catch (\Google_Exception $e) {
            $errors['google api error'] = json_decode($e->getMessage(), true);
            return false;
        }
    }


    public function handleVideo(){  # for server videos, not youtube ones
        $rel_path = "uploads/originals";

                if( 'mov' == $extension ){
                    $saveName_mp4 = "$saveName.mp4";
                    $successes[] = `ffmpeg -i $save_path $rel_path/$saveName_mp4 -hide_banner`;
                    if( !file_exists($save_path) ) {
                        $errors[] = "cannot create mp4 file for $saveNameExt";
                        self::_log("cannot create mp4 file for $saveNameExt");
                        return false;
                    }
                    unlink($save_path);
                    $extension = 'mp4';
                    $saveNameExt = $saveName_mp4;
                    $save_path = "$rel_path/$saveNameExt";
                }

                $currentVideoDuration =  shell_exec("ffmpeg -i $save_path 2>&1 | grep Duration");
                    //Duration: 00:00:04.17, start: 0.000000, bitrate: 165 kb/s
                  $actualDuration = substr($currentVideoDuration, 11, 12);
                  $arrHMS = explode(":", $actualDuration);
                  if( count($arrHMS) <2 ) {
                      $errors[] = "cannot measure duration of $saveNameExt";
                      self::_log("cannot measure duration of $saveNameExt");
                      return false;
                  }
                  $InSeconds = $arrHMS[2] + $arrHMS[1]*60 + $arrHMS[0]*3600;
                  $halfPoint = round($InSeconds/2);

                //ffmpeg -v -1 -vframes %S -i "%i" -vcodec pam -an -f rawvideo -y "%u.pam" 2> "%Z"  // how imagemagic does it
                $captureName = "{$saveName}_$extension.png";
                $thumbName =   "{$saveName}_$extension.jpg";
                $successes[] = `ffmpeg -ss $halfPoint -i $save_path -vframes 1 -filter:v 'yadif,scale=420:270' $rel_path/$captureName`;
                $successes[] = `convert $rel_path/$captureName $rel_path/$thumbName`;
                //unlink( "uploads/originals/$captureName" );

                $successes[] = `convert $rel_path/$thumbName -resize "112x112^" -gravity center -crop 112x112+0+0 +repage uploads/thumbs/$thumbName`;
                $successes[] = `convert $rel_path/$thumbName -resize "165x230^" -gravity center -crop 165x230+0+0 +repage uploads/wallets/$thumbName`;

                 // capture.jpg in /originals, video in /videos 
                if( !rename( $save_path, "uploads/videos/$saveNameExt") ){
                      $errors[] = "cannot move $saveNameExt to videos";
                      self::_log("cannot move $saveNameExt to videos");
                      return false;
                }
                $thumbs_bool = true;
                $upload_type = 'video';
                $size = filesize("$dir/uploads/videos/$saveNameExt");
    }


}
