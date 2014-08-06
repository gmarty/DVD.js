///<reference path='declarations/xtag.d.ts'/>
(function () {
    'use strict';

    // As per the spec.
    /** @const */ var DEFAULT_WIDTH = 300;
    /** @const */ var DEFAULT_HEIGHT = 150;

    // The list of attributes of the <video> tag to populate to the inner video element of x-video.
    // From http://www.w3.org/TR/html5/embedded-content-0.html#the-video-element
    var VIDEO_ATTRIBUTES = [
        'src',
        'crossorigin',
        'poster',
        'preload',
        'autoplay',
        'mediagroup',
        'loop',
        'muted',
        'width',
        'height'
    ];

    // From https://developer.mozilla.org/en-US/docs/Web/Guide/Events/Media_events
    var VIDEO_EVENT_TYPES = [
        'abort',
        'canplay',
        'canplaythrough',
        'canshowcurrentframe',
        'dataunavailable',
        'durationchange',
        'emptied',
        'empty',
        'ended',
        'error',
        'loadeddata',
        'loadedmetadata',
        'loadstart',
        'pause',
        'play',
        'playing',
        'progress',
        'ratechange',
        'seeked',
        'seeking',
        'suspend',
        'timeupdate',
        'volumechange',
        'waiting'
    ];

    // Find the prefixed version of document.fullscreenEnabled.
    var prefixedFullscreenEnabled = null;
    [
        'fullscreenEnabled',
        'mozFullScreenEnabled',
        'webkitFullscreenEnabled',
        'msFullscreenEnabled',
        'fullScreenEnabled'
    ].some(function (prefix) {
        if (document[prefix]) {
            prefixedFullscreenEnabled = prefix;
            return true;
        }
        return false;
    });

    // Find the prefixed version of element.requestFullscreen().
    var prefixedRequestFullscreen = null;
    [
        'requestFullscreen',
        'mozRequestFullScreen',
        'webkitRequestFullscreen',
        'msRequestFullscreen',
        'requestFullScreen'
    ].some(function (prefix) {
        if (document.body[prefix]) {
            prefixedRequestFullscreen = prefix;
            return true;
        }
        return false;
    });

    var template = xtag.createFragment('<div class="media-controls">' + '<div class="media-controls-enclosure">' + '<div class="media-controls-panel" style="transition:opacity 0.3s;-webkit-transition:opacity 0.3s;opacity:1;">' + '<input type="button" class="media-controls-rewind-button" hidden>' + '<input type="button" class="media-controls-play-button">' + '<input type="button" class="media-controls-forward-button" hidden>' + '<input type="range" value="0" step="any" max="0" class="media-controls-timeline">' + '<div class="media-controls-current-time-display">0:00</div>' + '<div class="media-controls-time-remaining-display" hidden>0:00</div>' + '<input type="button" class="media-controls-mute-button">' + '<input type="range" value="1" step="any" max="1" class="media-controls-volume-slider">' + '<input type="button" class="media-controls-menu-button" hidden>' + '<input type="button" class="media-controls-toggle-closed-captions-button" hidden>' + '<input type="button" class="media-controls-fullscreen-button" hidden>' + '</div>' + '</div>' + '</div>');

    /**
    * Transform a time in second to a human readable format.
    * Hours are only displayed if > 0:
    *  * 0:15   (minutes + seconds)
    *  * 0:0:15 (hours + minutes + seconds)
    * Seconds are padded with leading 0.
    *
    * @param {number} time
    * @returns {string}
    */
    function formatTimeDisplay(time) {
        var hours = Math.floor(time / 60 / 60);
        var minutes = Math.floor((time - (hours * 60 * 60)) / 60);
        var seconds = Math.floor(time - (hours * 60 * 60) - (minutes * 60));

        if (hours > 0 && minutes > 0) {
            return hours + ':' + minutes + ':' + padWithZero(seconds);
        }
        return minutes + ':' + padWithZero(seconds);

        /**
        * @param {number} num
        * @returns {string}
        */
        function padWithZero(num) {
            return ('00' + num).slice(-2);
        }
    }

    /**
    * Load a *.vtt file and parse it.
    *
    * @param {string} url
    * @param callback
    */
    function loadWebVTTFile(url, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.setRequestHeader('Content-Type', 'text/vtt; charset=utf-8');
        xhr.overrideMimeType && xhr.overrideMimeType('text/vtt');
        xhr.addEventListener('load', function (event) {
            var status = event.target.status;
            if (status === 200) {
                callback(parseWebVTT(event.target.response));
            } else {
                console.error('Error retrieving the URL %s.', url);
            }
        }, false);
        xhr.send();
    }

    /**
    * Parse a *.vtt file.
    * Shamelessly stolen from http://www.html5videoguide.net/demos/google_io/3_navigation/
    *
    * @param {string} data
    * @returns {Array.<Object>}
    */
    function parseWebVTT(data) {
        var srt = '';

        // Check WEBVTT identifier.
        if (data.substring(0, 6) !== 'WEBVTT') {
            console.error('Missing WEBVTT header: Not a WebVTT file - trying SRT.');
            srt = data;
        } else {
            // Remove WEBVTT identifier line.
            srt = data.split('\n').slice(1).join('\n');
        }

        // clean up string a bit
        srt = srt.replace(/\r+/g, ''); // remove DOS newlines
        srt = srt.trim();

        //srt = srt.replace(/<[a-zA-Z\/][^>]*>/g, ''); // remove all html tags for security reasons
        // parse cues
        var cues = [];
        var cuelist = srt.split('\n\n');
        for (var i = 0; i < cuelist.length; i++) {
            var cue = cuelist[i];
            var id = '';
            var startTime = 0;
            var endTime = 0;
            var text = '';
            var s = cue.split(/\n/);
            var t = 0;

            // is there a cue identifier present?
            if (!s[t].match(/(\d+):(\d+):(\d+)/)) {
                // cue identifier present
                id = s[0];
                t = 1;
            }

            // is the next line the time string
            if (!s[t].match(/(\d+):(\d+):(\d+)/)) {
                continue;
            }

            // parse time string
            var m = s[t].match(/(\d+):(\d+):(\d+)(?:.(\d+))?\s*-->\s*(\d+):(\d+):(\d+)(?:.(\d+))?/);
            if (m) {
                startTime = (parseInt(m[1], 10) * 60 * 60) + (parseInt(m[2], 10) * 60) + (parseInt(m[3], 10)) + (parseInt(m[4], 10) / 1000);
                endTime = (parseInt(m[5], 10) * 60 * 60) + (parseInt(m[6], 10) * 60) + (parseInt(m[7], 10)) + (parseInt(m[8], 10) / 1000);
            } else {
                continue;
            }

            // concatenate text lines to html text
            text = s.slice(t + 1).join('<br>');

            cues.push({ id: id, startTime: startTime, endTime: endTime, text: text });
        }

        return cues;
    }

    /**
    * Return the current chapter id from a list of cues and a time.
    *
    * @param {Array.<Object>} cues
    * @param {number} currentTime
    * @returns {number}
    */
    function getCurrentChapter(cues, currentTime) {
        var currentChapter = null;

        cues.some(function (cue, chapter) {
            if (cue.startTime <= currentTime && currentTime <= cue.endTime) {
                currentChapter = chapter;
                return true;
            }
            return false;
        });

        return currentChapter;
    }

    /**
    * Return an array of numbers starting at `start` and made of `count` elements.
    *
    * @param {number} start
    * @param {number} count
    * @returns {Array.<number>}
    */
    function range(start, count) {
        return Array.apply(0, Array(count)).map(function (element, index) {
            return index + start;
        });
    }

    /**
    * Initialize the x-video element by gathering existing DOM elements and attributes and creating
    * an inner video element.
    *
    * @param {HTMLUnknownElement} xVideo
    */
    function init(xVideo) {
        var playlist = [];
        var videos = xtag.toArray(xVideo.querySelectorAll('x-video > video'));
        var tracks = [];
        var menus = xtag.toArray(xVideo.querySelectorAll('x-menu'));

        //var attributes = {};
        // Let's process the case where `<x-video>` tag has a src attribute or sub `<source>` elements.
        if (!videos.length) {
            // Single video.
            // Create the inner video element.
            var innerVideo = document.createElement('video');

            playlist[0] = videoSrcElement(xVideo.getAttribute('id'), xVideo.getAttribute('src'), innerVideo, xVideo.getAttribute('label'));

            // Doest it have inner source/track elements?
            tracks = xtag.toArray(xVideo.querySelectorAll('x-video > track'));
            if (tracks.length) {
                playlist[0].trackRange = range(0, tracks.length);
            }

            // Move all source elements.
            var sources = xtag.toArray(xVideo.querySelectorAll('x-video > source'));
            sources.forEach(function (source) {
                innerVideo.appendChild(source);
            });

            tracks.forEach(function (source) {
                innerVideo.appendChild(source);
            });

            // We replicate the attribute on both <x-video> and the inner video elements.
            VIDEO_ATTRIBUTES.forEach(function (attr) {
                if (xVideo.hasAttribute(attr)) {
                    innerVideo.setAttribute(attr, xVideo.getAttribute(attr));
                }
            });

            // Propagate events of inner video element to x-video element.
            VIDEO_EVENT_TYPES.forEach(function (eventType) {
                innerVideo.addEventListener(eventType, function (event) {
                    xtag.fireEvent(xVideo, eventType);
                }, false);
            });

            xVideo.xtag.mediaControls.appendChild(innerVideo);

            videos = [innerVideo];
        } else {
            // Multiple videos playlist.
            var tracksLength = 0;

            videos.forEach(function (video, currentIndex) {
                xVideo.xtag.mediaControls.appendChild(video); // Move video element.

                playlist[currentIndex] = videoSrcElement(video.getAttribute('id'), video.currentSrc || video.src, video, video.getAttribute('label'));

                var videoTracks = xtag.toArray(video.querySelectorAll('track'));
                if (videoTracks.length) {
                    playlist[currentIndex].trackRange = range(tracksLength, videoTracks.length);

                    tracks = tracks.concat(videoTracks); // To be appended to inner video.
                    tracksLength += videoTracks.length;
                }

                // Propagate events of inner video element to x-video element.
                VIDEO_EVENT_TYPES.forEach(function (eventType) {
                    video.addEventListener(eventType, function (event) {
                        xtag.fireEvent(xVideo, eventType);
                    }, false);
                });
            });
            /*if (videos[0]) {
            // Copy HTML attributes of the first <video> tag on <x-video> tag.
            VIDEO_ATTRIBUTES.forEach(function(attribute) {
            if (videos[0].hasAttribute(attribute)) {
            attributes[attribute] = videos[0].getAttribute(attribute);
            }
            });
            if (videos[0].hasAttribute('controls')) {
            xVideo.setAttribute('controls', '');
            }
            }*/
        }

        // Keep a list of all HTML attributes on <x-video> tag to replicate to inner <video> tag.
        // The attributes present on the first video element will be overriden here.
        /*VIDEO_ATTRIBUTES.forEach(function(attribute) {
        if (xVideo.hasAttribute(attribute)) {
        attributes[attribute] = xVideo.getAttribute(attribute);
        }
        });*/
        // We replicate the attribute on both <x-video> and the inner video elements.
        /*for (var attr in attributes) {
        xVideo.setAttribute(attr, attributes[attr]);
        innerVideo.setAttribute(attr, attributes[attr]);
        }*/
        // When a track is loading, we find the chapter cues.
        /*function updateChapterCues(event) {
        var target = event.currentTarget;
        var innerVideo = target.parentNode;
        
        if (!innerVideo.textTracks) {
        return;
        }
        
        playlist.forEach(function(obj) {
        obj.trackRange.some(function(trackIndex) {
        var textTrack = innerVideo.textTracks[trackIndex];
        if (textTrack.kind === 'chapters' &&
        (textTrack.mode === 'hidden' || textTrack.mode === 'showing')) {
        obj.chapterCues = xtag.toArray(textTrack.cues);
        
        xVideo.xtag.rewindButton.removeAttribute('hidden');
        xVideo.xtag.forwardButton.removeAttribute('hidden');
        
        return true;
        }
        return false;
        });
        
        // Then, remove the event listener.
        if (target.tagName === 'TRACK') {
        target.removeEventListener('load', updateChapterCues);
        }
        });
        }*/
        videos.forEach(function (video, index) {
            if (index > 0) {
                // Hidding all the videos, except the first one.
                video.setAttribute('hidden', '');
            }

            function updateChapterCues(event) {
                if (!video.textTracks || !video.textTracks[0] || playlist[index].chapterCues.length > 0) {
                    return;
                }

                playlist[index].chapterCues = xtag.toArray(video.textTracks[0].cues);
            }

            // Detect the support of textTracks.
            if ('textTracks' in video) {
                var tracks = xtag.toArray(video.querySelectorAll('track'));
                tracks.forEach(function (track) {
                    if (track.track.cues && track.track.cues.length) {
                        // The WebVTT file is already loaded and parsed.
                        playlist[index].chapterCues = xtag.toArray(track.track.cues);
                    } else {
                        track.addEventListener('load', updateChapterCues);

                        // For Firefox > 33. See https://bugzil.la/1035505
                        track.addEventListener('loaded', updateChapterCues);
                    }
                });
            } else {
                // @todo Fallback for non supporting browsers.
            }
        });

        menus.forEach(function (menu) {
            var forId = menu.getAttribute('for');
            var forElement = document.getElementById(forId);
            if (!forId || !forElement) {
                // Global menu.
                xVideo.menus.push(menu);
            } else {
                // Local menu.
                var targetId = forId;
                var targetIndex = null;
                playlist.some(function (video, index) {
                    if (video.id === targetId) {
                        targetIndex = index;
                        return true;
                    }
                    return false;
                });

                if (targetIndex === null) {
                    // We can't do much here. Just disregard this tag.
                    return;
                }

                playlist[targetIndex].menus.push(menu);
                xVideo.appendChild(menu);
            }
        });

        xVideo.playlist = playlist;
    }

    /**
    * Generate internal representation of video elements (src, chapters...).
    *
    * @param {string} id
    * @param {string} src
    * @param {HTMLVideoElement} video
    * @param {string} label
    * @returns {Object}
    */
    function videoSrcElement(id, src, video, label) {
        if (typeof id === "undefined") { id = null; }
        if (typeof src === "undefined") { src = null; }
        if (typeof video === "undefined") { video = null; }
        if (typeof label === "undefined") { label = null; }
        return {
            id: id,
            src: src,
            video: video,
            label: label,
            trackRange: [],
            chapterCues: [],
            menus: []
        };
    }

    function updateEventListeners(oldVideo, newVideo, evt) {
        if (oldVideo) {
            oldVideo.pause();
            oldVideo.setAttribute('hidden', '');
        }
        if (newVideo) {
            newVideo.removeAttribute('hidden');
        }

        [
            'play',
            'pause',
            'durationchange',
            'timeupdate',
            'volumechange',
            'ended'
        ].forEach(function (eventType) {
            if (oldVideo) {
                oldVideo.removeEventListener(eventType, evt);
            }
            if (newVideo) {
                newVideo.addEventListener(eventType, evt);
            }
        });
    }

    /**
    * Hide all menu of the passed x-video object.
    * @param {Object} xVideo
    */
    function hideAllMenu(xVideo) {
        var menus = xVideo.querySelectorAll('x-menu');
        for (var i = 0; i < menus.length; i++) {
            var menu = menus[i];
            menu.hide();
        }
    }

    xtag.register('x-video', {
        prototype: Object.create(HTMLVideoElement.prototype),
        lifecycle: {
            created: function () {
                var xVideo = this;

                // First of all, we hide the native player in Chrome, not needed as JavaScript is enabled.
                var styleTag = document.createElement('style');
                styleTag.textContent = 'x-video video::-webkit-media-controls{display:none}';
                xVideo.appendChild(styleTag);

                // Setting some object's properties.
                xVideo.videoIndex = 0; // The index of the current video in the playlist.
                xVideo.preTimelinePausedStatus = false; // The paused state of the video before using timeline.

                // Appending the internal elements.
                this.appendChild(template.cloneNode(true));

                // Set HTML elements.
                this.xtag.mediaControls = this.querySelector('.media-controls'); // Target for fullscreen.
                this.xtag.mediaControlsEnclosure = this.querySelector('.media-controls-enclosure');
                this.xtag.mediaControlsPanel = this.querySelector('.media-controls-panel');
                this.xtag.rewindButton = this.querySelector('.media-controls-rewind-button');
                this.xtag.playButton = this.querySelector('.media-controls-play-button');
                this.xtag.forwardButton = this.querySelector('.media-controls-forward-button');
                this.xtag.timeline = this.querySelector('.media-controls-timeline');
                this.xtag.currentTimeDisplay = this.querySelector('.media-controls-current-time-display');
                this.xtag.timeRemainingDisplay = this.querySelector('.media-controls-time-remaining-display');
                this.xtag.muteButton = this.querySelector('.media-controls-mute-button');
                this.xtag.volumeSlider = this.querySelector('.media-controls-volume-slider');
                this.xtag.menuButton = this.querySelector('.media-controls-menu-button');
                this.xtag.closedCaptionsButton = this.querySelector('.media-controls-closed-captions-button');
                this.xtag.fullscreenButton = this.querySelector('.media-controls-fullscreen-button');

                // Hold the list
                this.menus = [];

                // An optional function to call when the menu button is clicked.
                xVideo.xtag.onMenuHandler = null;

                // Initialize the DOM elements.
                init(xVideo);

                // Listen to the inner video events to maintain the interface in sync with the video state.
                xVideo.xtag.evt = {};
                xVideo.xtag.evt.handleEvent = function (event) {
                    var target = event.target;

                    switch (event.type) {
                        case 'play':
                            xtag.addClass(xVideo.xtag.playButton, 'paused');
                            break;

                        case 'pause':
                            xtag.removeClass(xVideo.xtag.playButton, 'paused');
                            break;

                        case 'durationchange':
                            xVideo.xtag.timeline.setAttribute('max', target.duration);
                            break;

                        case 'timeupdate':
                            xVideo.xtag.timeline.value = target.currentTime;
                            xVideo.xtag.currentTimeDisplay.textContent = formatTimeDisplay(target.currentTime);

                            // Fix for Firefox not always firing durationchange event if the
                            // video appears multiple times on a page.
                            xVideo.xtag.timeline.setAttribute('max', target.duration);
                            break;

                        case 'volumechange':
                            if (target.muted) {
                                xtag.addClass(xVideo.xtag.muteButton, 'muted');
                            } else {
                                xtag.removeClass(xVideo.xtag.muteButton, 'muted');
                            }
                            xVideo.xtag.volumeSlider.value = target.volume;
                            break;

                        case 'ended':
                            // At the end of the video, update the src to the next in the playlist, if any.
                            if (xVideo.playlist.length > 1 && xVideo.videoIndex < xVideo.playlist.length - 1) {
                                updateEventListeners(xVideo.playlist[xVideo.videoIndex].video, xVideo.playlist[++xVideo.videoIndex].video, xVideo.xtag.evt);

                                // Update the src attribute.
                                //xVideo.src = xVideo.playlist[xVideo.videoIndex].src;
                                xtag.fireEvent(xVideo, 'videochange');
                            }
                            break;
                    }
                };
                updateEventListeners(null, xVideo.playlist[xVideo.videoIndex].video, xVideo.xtag.evt);

                // Show the media controls bar if the controls attribute is present.
                this.controls = this.hasAttribute('controls');

                // Check if the inner video controls attribute changes on any of the videos.
                xVideo.playlist.forEach(function (videoSrcElement) {
                    var observer = new MutationObserver(function (mutations) {
                        mutations.forEach(function (mutation) {
                            switch (mutation.attributeName) {
                                case 'controls':
                                    if (xVideo.hasAttribute('controls')) {
                                        setTimeout(function () {
                                            xVideo.removeAttribute('controls');
                                        }, 10);
                                    } else {
                                        setTimeout(function () {
                                            xVideo.setAttribute('controls', 'true');
                                        }, 10);
                                    }
                                    videoSrcElement.video.removeAttribute('controls');
                                    break;
                            }
                        });
                    });
                    observer.observe(videoSrcElement.video, { attributes: true, attributeFilter: ['controls'] });
                });

                // Reset the visual state of the timeline.
                xVideo.xtag.timeline.value = 0;
                xVideo.xtag.currentTimeDisplay.textContent = formatTimeDisplay(0);

                // Update the muted state HTML attribute is present.
                this.muted = this.hasAttribute('muted');

                xVideo.xtag.volumeSlider.value = 1;

                // We show prev/next buttons on playlists.
                if (xVideo.playlist.length > 1) {
                    xVideo.xtag.rewindButton.removeAttribute('hidden');
                    xVideo.xtag.forwardButton.removeAttribute('hidden');
                }

                // Build a list of all valid track elements.
                /*var chapterTracks = children.filter(function(child) {
                return child.tagName === 'TRACK' && child.kind === 'chapters' &&
                child.hasAttribute('src') && child.getAttribute('src') !== '';
                });
                
                // Then, select the track element with a default attribute...
                var activeChapterTrack: number = null;
                chapterTracks.some(function(chapterTrack) {
                if (chapterTrack.hasAttribute('default')) {
                activeChapterTrack = chapterTrack;
                return true;
                }
                return false;
                })
                // ... or just pick up the first one in the list.
                if (activeChapterTrack === null && chapterTracks.length > 0) {
                activeChapterTrack = chapterTracks[0];
                }
                
                if (activeChapterTrack) {
                // We defer processing the WebVTT file in case the browser will do it.
                xVideo.xtag.video.addEventListener('durationchange', waitForCues, false);
                }*/
                /**
                * Check if the active chapter track element already has cues loaded and parsed by the
                * browser. If not, we do it ourselves.
                */
                /*function waitForCues() {
                if (activeChapterTrack.track.cues && activeChapterTrack.track.cues.length > 0) {
                // Let the browser do the hard work for us.
                xVideo.playlist[xVideo.videoIndex].chapterCues = xtag.toArray(activeChapterTrack.track.cues);
                processCues(xVideo.playlist[xVideo.videoIndex].chapterCues);
                } else {
                loadWebVTTFile(activeChapterTrack.src, function(cues) {
                xVideo.playlist[xVideo.videoIndex].chapterCues = cues;
                processCues(xVideo.playlist[xVideo.videoIndex].chapterCues);
                });
                }
                
                // Once executed, we remove the event listener.
                xVideo.xtag.video.removeEventListener('durationchange', waitForCues, false);
                }*/
                /**
                * Now that we have cues, we use them and show the chapter navigation buttons.
                *
                * @param {Array.<Object>} cues
                */
                /*function processCues(cues: Array) {
                if (!cues.length) {
                // We expect at least one element.
                return;
                }
                
                xVideo.xtag.rewindButton.removeAttribute('hidden');
                xVideo.xtag.forwardButton.removeAttribute('hidden');
                }*/
                // Show the menu button if there is at least one menu.
                var hasMenu = this.menus.length || xVideo.playlist.some(function (video) {
                    return !!video.menus.length;
                });
                if (hasMenu) {
                    xVideo.xtag.menuButton.removeAttribute('hidden');
                }

                // Show the full screen button if the API is available.
                if (prefixedRequestFullscreen) {
                    xVideo.xtag.fullscreenButton.removeAttribute('hidden');
                }
            },
            inserted: function () {
            },
            removed: function () {
                // @todo Abort the XHR from parseWebVTT() if there is any.
            },
            attributeChanged: function (attribute, oldValue, newValue) {
                if (attribute === 'controls') {
                    this.controls = this.hasAttribute('controls');
                    return;
                }

                if (VIDEO_ATTRIBUTES.indexOf(attribute) > -1) {
                    if (this.hasAttribute(attribute)) {
                        this.playlist.forEach(function (videoSrcElement) {
                            videoSrcElement.video.setAttribute(attribute, newValue);
                        });
                    } else {
                        this.playlist.forEach(function (videoSrcElement) {
                            videoSrcElement.video.removeAttribute(attribute);
                        });
                    }
                }
            }
        },
        events: {
            'click:delegate(.media-controls-play-button)': function (event) {
                var xVideo = event.currentTarget;
                if (xVideo.playlist[xVideo.videoIndex].video.paused) {
                    xVideo.playlist[xVideo.videoIndex].video.play();
                } else {
                    xVideo.playlist[xVideo.videoIndex].video.pause();
                }
            },
            'click:delegate(input.media-controls-rewind-button)': function (event) {
                var xVideo = event.currentTarget;
                var currentTime = xVideo.playlist[xVideo.videoIndex].video.currentTime;
                var currentChapter = null;

                if (!xVideo.playlist[xVideo.videoIndex].video.paused) {
                    // If the video is playing, we substract 1 second to be able to jump to previous
                    // chapter. Otherwise, it would jump at the beginning of the current one.
                    currentTime = Math.max(0, currentTime - 1.000);
                }

                if (currentTime === 0 && xVideo.playlist.length > 1 && xVideo.videoIndex > 0) {
                    // We play the previous video in the playlist.
                    updateEventListeners(xVideo.playlist[xVideo.videoIndex].video, xVideo.playlist[--xVideo.videoIndex].video, xVideo.xtag.evt);

                    //xVideo.src = xVideo.playlist[xVideo.videoIndex].src;
                    //xVideo.textTracks = xVideo.playlist[xVideo.videoIndex].textTracks;
                    xVideo.play();

                    xtag.fireEvent(xVideo, 'videochange');
                    return;
                }

                if (!xVideo.playlist[xVideo.videoIndex].chapterCues || !xVideo.playlist[xVideo.videoIndex].chapterCues.length) {
                    // No chapters? We go at the beginning of the video.
                    xVideo.currentTime = 0;
                    xVideo.play();
                    return;
                }

                currentChapter = getCurrentChapter(xVideo.playlist[xVideo.videoIndex].chapterCues, currentTime);

                if (currentChapter !== null) {
                    // Jump to the previous chapter.
                    xVideo.currentTime = xVideo.playlist[xVideo.videoIndex].chapterCues[currentChapter].startTime;
                    xVideo.play();

                    // Emit a chapterchange event.
                    xtag.fireEvent(xVideo, 'chapterchange', {
                        detail: { chapter: currentChapter }
                    });
                }
            },
            'click:delegate(input.media-controls-forward-button)': function (event) {
                var xVideo = event.currentTarget;
                var currentTime = xVideo.currentTime;
                var currentChapter = null;
                var targetTime = xVideo.duration;
                var targetChapter = 0;

                if (!xVideo.playlist[xVideo.videoIndex].chapterCues || !xVideo.playlist[xVideo.videoIndex].chapterCues.length) {
                    // No chapters? We go straight to the end of the video.
                    xVideo.currentTime = targetTime;
                    return;
                }

                currentChapter = getCurrentChapter(xVideo.playlist[xVideo.videoIndex].chapterCues, currentTime);

                if (currentChapter === null) {
                    return;
                }

                targetChapter = currentChapter + 1;

                if (xVideo.playlist[xVideo.videoIndex].chapterCues[targetChapter]) {
                    // Emit a chapterchange event.
                    xtag.fireEvent(xVideo, 'chapterchange', {
                        detail: { chapter: targetChapter }
                    });

                    targetTime = Math.min(targetTime, xVideo.playlist[xVideo.videoIndex].chapterCues[targetChapter].startTime);
                }

                // Update the video currentTime.
                xVideo.currentTime = targetTime;

                if (targetTime !== xVideo.duration) {
                    // We resume playback if the cursor is not at the end of the video.
                    xVideo.play();
                }
            },
            /**
            * How is the timeline working?
            * 1. Mousedown on element = save the initial paused value and pause the video.
            * 2. Update the currentTime as the slider is moved.
            * 3. When the mouse is released, set the initial paused value back.
            * @todo Test on touch devices and fix accordingly.
            */
            'mousedown:delegate(input.media-controls-timeline)': function (event) {
                var xVideo = event.currentTarget;
                xVideo.preTimelinePausedStatus = xVideo.paused;
                xVideo.pause();
                xVideo.timelineMoving = true;
            },
            'mousemove:delegate(input.media-controls-timeline)': function (event) {
                var xVideo = event.currentTarget;
                if (!xVideo.timelineMoving) {
                    return;
                }
                xVideo.pause();
                xVideo.currentTime = xVideo.xtag.timeline.value;
                //xVideo.xtag.currentTimeDisplay.textContent = formatTimeDisplay(xVideo.xtag.timeline.value);
            },
            'mouseup:delegate(input.media-controls-timeline)': function (event) {
                var xVideo = event.currentTarget;
                xVideo.timelineMoving = false;
                if (!xVideo.preTimelinePausedStatus) {
                    xVideo.play();
                }
            },
            'click:delegate(input.media-controls-mute-button)': function (event) {
                var xVideo = event.currentTarget;
                xVideo.muted = !xVideo.muted;
            },
            'input:delegate(.media-controls-volume-slider)': function (event) {
                var xVideo = event.currentTarget;
                xVideo.volume = xVideo.xtag.volumeSlider.value;
                xVideo.muted = (xVideo.volume === 0);
            },
            'click:delegate(.media-controls-menu-button)': function (event) {
                var xVideo = event.currentTarget;

                hideAllMenu(xVideo);

                if (xVideo.xtag.onMenuHandler) {
                    xVideo.pause();
                    xVideo.xtag.onMenuHandler(event);
                } else if (xVideo.playlist[xVideo.videoIndex].menus[0]) {
                    // Does this video have a local menu?
                    xVideo.pause();
                    xVideo.playlist[xVideo.videoIndex].menus[0].show();
                } else if (xVideo.menus[0]) {
                    // Otherwise, we show the global menu.
                    xVideo.pause();
                    xVideo.menus[0].show();
                }
            },
            'click:delegate(.media-controls-fullscreen-button)': function (event) {
                // @todo If already on fullscreen mode, click on the button should exit fullscreen.
                // @todo Dismiss controls on full screen mode.
                var xVideo = event.currentTarget;
                if (prefixedRequestFullscreen) {
                    xVideo.xtag.mediaControls[prefixedRequestFullscreen]();
                }
            }
        },
        // @todo Refactor to be less verbose and more DRY.
        accessors: {
            // Read only attributes.
            videoWidth: {
                get: function () {
                    return this.playlist[this.videoIndex].video.videoWidth;
                }
            },
            videoHeight: {
                get: function () {
                    return this.playlist[this.videoIndex].video.videoHeight;
                }
            },
            buffered: {
                get: function () {
                    return this.playlist[this.videoIndex].video.buffered;
                }
            },
            currentSrc: {
                get: function () {
                    return this.playlist[this.videoIndex].video.currentSrc;
                }
            },
            duration: {
                get: function () {
                    return this.playlist[this.videoIndex].video.duration;
                }
            },
            ended: {
                get: function () {
                    return this.playlist[this.videoIndex].video.ended;
                }
            },
            error: {
                get: function () {
                    return this.playlist[this.videoIndex].video.error;
                }
            },
            initialTime: {
                get: function () {
                    return this.playlist[this.videoIndex].video.initialTime;
                }
            },
            paused: {
                get: function () {
                    return this.playlist[this.videoIndex].video.paused;
                }
            },
            played: {
                get: function () {
                    return this.playlist[this.videoIndex].video.played;
                }
            },
            readyState: {
                get: function () {
                    return this.playlist[this.videoIndex].video.readyState;
                }
            },
            seekable: {
                get: function () {
                    return this.playlist[this.videoIndex].video.seekable;
                }
            },
            seeking: {
                get: function () {
                    return this.playlist[this.videoIndex].video.seeking;
                }
            },
            // @todo Check support for this attribute before adding to accessors.
            mozChannels: {
                get: function () {
                    return this.playlist[this.videoIndex].video.mozChannels;
                }
            },
            mozSampleRate: {
                get: function () {
                    return this.playlist[this.videoIndex].video.mozSampleRate;
                }
            },
            // Get/Set attributes.
            width: {
                get: function () {
                    return this.playlist[this.videoIndex].video.width;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.width = value;
                }
            },
            height: {
                get: function () {
                    return this.playlist[this.videoIndex].video.height;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.height = value;
                }
            },
            poster: {
                get: function () {
                    return this.playlist[this.videoIndex].video.poster;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.poster = value;
                }
            },
            audioTracks: {
                get: function () {
                    return this.playlist[this.videoIndex].video.audioTracks;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.audioTracks = value;
                }
            },
            autoplay: {
                get: function () {
                    return this.playlist[this.videoIndex].video.autoplay;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.autoplay = value;
                }
            },
            controller: {
                get: function () {
                    return this.playlist[this.videoIndex].video.controller;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.controller = value;
                }
            },
            controls: {
                // Here, we get/set directly from/to the x-video element, not from the inner video element.
                get: function () {
                    return this.xtag.controls;
                },
                set: function (value) {
                    if (value) {
                        this.xtag.mediaControlsPanel.removeAttribute('hidden');
                        this.xtag.mediaControlsPanel.style.opacity = 1;
                    } else {
                        this.xtag.mediaControlsPanel.setAttribute('hidden', '');
                        this.xtag.mediaControlsPanel.style.opacity = 0;
                    }
                }
            },
            crossOrigin: {
                get: function () {
                    return this.playlist[this.videoIndex].video.crossOrigin;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.crossOrigin = value;
                }
            },
            currentTime: {
                get: function () {
                    return this.playlist[this.videoIndex].video.currentTime;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.currentTime = value;
                }
            },
            defaultMuted: {
                get: function () {
                    return this.playlist[this.videoIndex].video.defaultMuted;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.defaultMuted = value;
                }
            },
            defaultPlaybackRate: {
                get: function () {
                    return this.playlist[this.videoIndex].video.defaultPlaybackRate;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.defaultPlaybackRate = value;
                }
            },
            loop: {
                get: function () {
                    return this.playlist[this.videoIndex].video.loop;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.loop = value;
                }
            },
            mediaGroup: {
                get: function () {
                    return this.playlist[this.videoIndex].video.mediaGroup;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.mediaGroup = value;
                }
            },
            muted: {
                get: function () {
                    return this.playlist[this.videoIndex].video.muted;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.muted = value;
                }
            },
            networkState: {
                get: function () {
                    return this.playlist[this.videoIndex].video.networkState;
                }
            },
            playbackRate: {
                get: function () {
                    return this.playlist[this.videoIndex].video.playbackRate;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.playbackRate = value;
                }
            },
            preload: {
                get: function () {
                    return this.playlist[this.videoIndex].video.preload;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.preload = value;
                }
            },
            src: {
                get: function () {
                    return this.playlist[this.videoIndex].video.src;
                },
                set: function (value) {
                    if (this.playlist[this.videoIndex]) {
                        this.playlist[this.videoIndex].src = value;
                    }
                    this.playlist[this.videoIndex].video.src = value;
                }
            },
            textTracks: {
                get: function () {
                    return this.playlist[this.videoIndex].video.textTracks;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.textTracks = value;
                }
            },
            videoTracks: {
                get: function () {
                    return this.playlist[this.videoIndex].video.videoTracks;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.videoTracks = value;
                }
            },
            volume: {
                get: function () {
                    return this.playlist[this.videoIndex].video.volume;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.volume = value;
                }
            },
            // Extra feature methods
            /*onchapterchange: {
            get: function() {
            return this.xtag.onchapterchangeListener;
            },
            set: function(event) {
            // @todo Remove event listener for this.xtag.onchapterchangeListener if previously set.
            this.xtag.onchapterchangeListener = event;
            this.addEventListener('chapterchange', event, false);
            }
            },*/
            onmenu: {
                get: function () {
                    return this.xtag.onMenuHandler;
                },
                set: function (value) {
                    if (typeof value !== 'function') {
                        console.error('Provided param is not a function');
                        return;
                    }
                    this.xtag.onMenuHandler = value;
                }
            },
            // @todo Check support for this attribute before adding to accessors.
            mozFrameBufferLength: {
                get: function () {
                    return this.playlist[this.videoIndex].video.mozFrameBufferLength;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.mozFrameBufferLength = value;
                }
            },
            // @todo Check support for this attribute before adding to accessors.
            mozSrcObject: {
                get: function () {
                    return this.playlist[this.videoIndex].video.mozSrcObject;
                },
                set: function (value) {
                    this.playlist[this.videoIndex].video.mozSrcObject = value;
                }
            }
        },
        methods: {
            canPlayType: function (type) {
                return this.playlist[this.videoIndex].video.canPlayType(type);
            },
            /*fastSeek: function(time) {
            return this.playlist[this.videoIndex].video.fastSeek(time);
            },*/
            load: function () {
                return this.playlist[this.videoIndex].video.load();
            },
            pause: function () {
                return this.playlist[this.videoIndex].video.pause();
            },
            play: function () {
                return this.playlist[this.videoIndex].video.play();
            },
            addTextTrack: function (kind, label, language) {
                if (typeof label === "undefined") { label = undefined; }
                if (typeof language === "undefined") { language = undefined; }
                return this.playlist[this.videoIndex].video.addTextTrack(kind, label, language);
            },
            // @todo Check support for this attribute before adding to methods.
            mozGetMetadata: function () {
                return this.playlist[this.videoIndex].video.mozGetMetadata();
            },
            // New methods.
            /**
            * Play the video specified by its order in the playlist.
            *
            * @param {number} videoIndex
            */
            playByIndex: function (videoIndex) {
                if (typeof videoIndex !== 'number') {
                    console.error('Invalid video number');
                    return;
                }
                if (videoIndex < 0 || videoIndex >= this.playlist.length) {
                    console.error('Video requested out of bound');
                    return;
                }

                updateEventListeners(this.playlist[this.videoIndex].video, this.playlist[videoIndex].video, this.xtag.evt);
                this.videoIndex = videoIndex;
                hideAllMenu(this);
                this.play();
            },
            /**
            * Play the video specified by its ID attribute.
            *
            * @param {string} elementID
            */
            playByID: function (elementID) {
                if (elementID === undefined) {
                    console.error('Missing element ID');
                    return;
                }
                if (typeof elementID !== 'string') {
                    elementID = String(elementID);
                }

                var targetElementIndex = null;
                this.playlist.some(function (videoSrcElement, index) {
                    if (videoSrcElement.id === elementID) {
                        targetElementIndex = index;
                        return true;
                    }
                    return false;
                });

                if (targetElementIndex === null) {
                    console.error('Unknown element ID');
                    return;
                }

                updateEventListeners(this.playlist[this.videoIndex].video, this.playlist[targetElementIndex].video, this.xtag.evt);
                this.videoIndex = targetElementIndex;
                hideAllMenu(this);
                this.play();
            },
            /**
            * Play the specified chapter in the current video on the playlist.
            *
            * @param {number} chapterIndex
            */
            playChapter: function (chapterIndex) {
                if (typeof chapterIndex !== 'number') {
                    console.error('Invalid chapter number');
                    return;
                }
                if (chapterIndex < 0 || chapterIndex >= this.playlist[this.videoIndex].chapterCues.length) {
                    console.error('Chapter requested out of bound');
                    return;
                }

                this.currentTime = this.playlist[this.videoIndex].chapterCues[chapterIndex].startTime;
                this.play();
            },
            /**
            * Play the menu specified by its ID attribute.
            *
            * @param {string} elementID
            */
            playMenuByID: function (elementID) {
                if (elementID === undefined) {
                    console.error('Missing element ID');
                    return;
                }
                if (typeof elementID !== 'string') {
                    elementID = String(elementID);
                }

                var menu = this.querySelector('#' + elementID);

                if (!menu) {
                    console.error('Unknown element ID');
                    return;
                }

                this.pause();
                hideAllMenu(this);
                menu.show();
            }
        }
    });
})();

///<reference path='declarations/xtag.d.ts'/>
/** @const */ var MENU_MODE;
(function (MENU_MODE) {
    MENU_MODE[MENU_MODE["GLOBAL"] = 0] = "GLOBAL";
    MENU_MODE[MENU_MODE["LOCAL"] = 1] = "LOCAL";
})(MENU_MODE || (MENU_MODE = {}));

(function () {
    'use strict';

    function init(xMenu) {
        if (xMenu.xtag.mode === null) {
            return;
        }

        if (!xMenu.hasChildNodes()) {
            // If there is nothing inside the <x-menu>tag, we create a simple navigation menu.
            if (xMenu.xtag.mode === 0 /* GLOBAL */) {
                xMenu.xtag.parent.playlist.forEach(function (video, index) {
                    var btn = document.createElement('input');
                    btn.type = 'button';
                    btn.dataset.id = index;
                    btn.className = 'btn';
                    btn.value = video.label ? video.label : 'Video ' + (index + 1);

                    xMenu.appendChild(btn);
                });
            } else if (xMenu.xtag.mode === 1 /* LOCAL */) {
                xMenu.xtag.videoSrcElement.chapterCues.forEach(function (chapter, index) {
                    var btn = document.createElement('input');
                    btn.type = 'button';
                    btn.dataset.id = index;
                    btn.className = 'btn';
                    btn.value = chapter.text ? chapter.text : 'Chapter ' + (index + 1);

                    xMenu.appendChild(btn);
                });
            }
        }

        // Dismiss the menu when pressing the `Esc` key.
        xtag.addEvent(document, 'keyup:keypass(27)', function (event) {
            xMenu.hide();
        });

        xMenu.xtag.initialized = true;
    }

    xtag.register('x-menu', {
        lifecycle: {
            created: function () {
                var xMenu = this;

                xMenu.xtag.mode = null;
                xMenu.xtag.parent = xMenu.parentNode;
                xMenu.xtag.videoSrcElement = null;

                // @todo Emit an `init` event in x-video and listen it here.
                setTimeout(function () {
                    if (!xMenu.hasAttribute('for')) {
                        xMenu.xtag.mode = 0 /* GLOBAL */;
                    } else {
                        xMenu.xtag.mode = 1 /* LOCAL */;

                        // Get a reference to parent playlist or chapterCues.
                        var targetId = xMenu.getAttribute('for');
                        var targetIndex = null;
                        xMenu.xtag.parent.playlist.some(function (video, index) {
                            if (video.id === targetId) {
                                targetIndex = index;
                                return true;
                            }
                            return false;
                        });

                        if (targetIndex !== null) {
                            xMenu.xtag.videoSrcElement = xMenu.xtag.parent.playlist[targetIndex];
                        }
                    }
                }, 16);
            },
            inserted: function () {
            },
            removed: function () {
            },
            attributeChanged: function (attribute, oldValue, newValue) {
            }
        },
        events: {
            'click:delegate(input[type="button"])': function (event) {
                var menuBtn = event.target;
                var xMenu = menuBtn.parentNode;
                if (!xMenu.xtag.parent) {
                    return;
                }

                /*var index = parseInt(menuBtn.dataset.id, 10);

                if (xMenu.xtag.mode === 0 *//* GLOBAL *//*) {
                    xMenu.xtag.parent.playByIndex(index);
                } else if (xMenu.xtag.mode === 1 *//* LOCAL *//*) {
                    xMenu.xtag.parent.playChapter(index);
                }

                xMenu.hide();*/
            }
        },
        accessors: {},
        methods: {
            show: function () {
                var xMenu = this;
                if (!xMenu.xtag.parent) {
                    return;
                }

                if (!xMenu.xtag.initialized) {
                    init(xMenu);
                }

                xMenu.style.display = 'flex';
            },
            hide: function () {
                var xMenu = this;
                xMenu.style.display = 'none';
            }
        }
    });
})();
