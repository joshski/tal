/**
 * @preserve Copyright (c) 2014 British Broadcasting Corporation
 * (http://www.bbc.co.uk) and TAL Contributors (1)
 *
 * (1) TAL Contributors are listed in the AUTHORS file and at
 *     https://github.com/fmtvp/TAL/AUTHORS - please extend this file,
 *     not this notice.
 *
 * @license Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * All rights reserved
 * Please contact us for an alternative licence
 */

(function() {
    this.HTML5MediaPlayerTests = AsyncTestCase("HTML5MediaPlayer");

    var config = {"modules":{"base":"antie/devices/browserdevice","modifiers":["antie/devices/mediaplayer/html5"]}, "input":{"map":{}},"layouts":[{"width":960,"height":540,"module":"fixtures/layouts/default","classes":["browserdevice540p"]}],"deviceConfigurationKey":"devices-html5-1"};

    var stubCreateElementResults = undefined;
    var mediaEventListeners = undefined;
    var sourceEventListeners = undefined;
    var stubCreateElement = function (sandbox, application) {

        var device = application.getDevice();

        var stubFunc = function(type, id) {
            if (id && stubCreateElementResults[type]) {
                stubCreateElementResults[type].id = id;
            }

            return stubCreateElementResults[type];
        };

        return sandbox.stub(device, "_createElement", stubFunc);
    };

    // Setup device specific mocking
    var deviceMockingHooks = {
        setup: function(sandbox, application) {
            stubCreateElement(sandbox,application);
        },
        sendMetadata: function(mediaPlayer, currentTime, range) {

            var mediaElements = [stubCreateElementResults.video, stubCreateElementResults.audio];
            for (var i = 0; i < mediaElements.length; i++) {
                var media = mediaElements[i];
                media.seekable.length = 1;
                media.seekable.start.returns(range.start);
                media.seekable.end.returns(range.end);
                media.currentTime = currentTime;
            }
            mediaEventListeners.loadedmetadata();
        },
        finishBuffering: function(mediaPlayer) {
            mediaEventListeners.canplaythrough();
        },
        emitPlaybackError: function(mediaPlayer) {

            // MEDIA_ERR_NETWORK == 2
            // This code, or higher, is needed for the error event. A value of 1 should result in an abort event.
            // See http://www.w3.org/TR/2011/WD-html5-20110405/video.html
            stubCreateElementResults.video.error =  { code: 2 };
            stubCreateElementResults.audio.error =  { code: 2 };

            var errorEvent = {
                type: "error"
            };
            mediaEventListeners.error(errorEvent);
        },
        reachEndOfMedia: function(mediaPlayer) {
            var endedEvent = {
                type: "ended"
            };
            mediaEventListeners.ended(endedEvent);
        },
        startBuffering: function(mediaPlayer) {
            var waitingEvent = {
                type: "waiting"
            };
            mediaEventListeners.waiting(waitingEvent);
        },
        mockTime: function(mediaplayer) {
        },
        makeOneSecondPass: function(mediaplayer, time) {
            var timeUpdateEvent = {
                type: "timeupdate"
            };
            mediaEventListeners.timeupdate(timeUpdateEvent);
        },
        unmockTime: function(mediaplayer) {
        }
    };

    this.HTML5MediaPlayerTests.prototype.setUp = function() {
        this.sandbox = sinon.sandbox.create();

        // We will use a div to provide fake elements for video and audio elements. This is to get around browser
        // implementations of the media elements preventing you from doing particular things unless a video has been
        // loaded and is in the right state, for example you might receive:
        //      InvalidStateError: Failed to set the 'currentTime' property on 'HTMLMediaElement': The element's readyState is HAVE_NOTHING
        stubCreateElementResults = {
            video: document.createElement("div"),
            audio: document.createElement("div"),
            source: document.createElement("source")
        };
        mediaEventListeners = {};
        sourceEventListeners = {};
        var self = this;
        var mediaElements = [stubCreateElementResults.video, stubCreateElementResults.audio];
        for (var i = 0; i < mediaElements.length; i++) {
            var media = mediaElements[i];
            media.seekable = {
                start: this.sandbox.stub(),
                end: this.sandbox.stub()
            };
            media.play = this.sandbox.stub();
            media.pause = this.sandbox.stub();
            media.load = this.sandbox.stub();
            media.addEventListener = function (event, callback) {
                if (mediaEventListeners[event]) { throw "Listener already registered on media mock for event: " + event; }
                mediaEventListeners[event] = callback;
            };
        }
        this.sandbox.stub(stubCreateElementResults.source, "addEventListener", function(event, callback) {
            if (sourceEventListeners[event]) { throw "Listener already registered on source mock for event: " + event; }
            sourceEventListeners[event] = callback;
        });
    };

    this.HTML5MediaPlayerTests.prototype.tearDown = function() {
        this.sandbox.restore();

        // Ensure we have a clean DOM
        var elementsToRemove = [ 'mediaPlayerVideo', 'mediaPlayerAudio' ];
        for (var i = 0; i < elementsToRemove.length; i++) {
            var element = document.getElementById(elementsToRemove[i]);
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        }

    };

    this.HTML5MediaPlayerTests.prototype.runMediaPlayerTest = function (queue, action) {
        var self = this;
        queuedApplicationInit(queue, 'lib/mockapplication', ["antie/devices/mediaplayer/html5", "antie/devices/mediaplayer/mediaplayer"],
            function(application, MediaPlayerImpl, MediaPlayer) {
                self._createElementStub = stubCreateElement(this.sandbox, application);
                this._device = application.getDevice();
                self._mediaPlayer = this._device.getMediaPlayer();
                action.call(self, MediaPlayer);
            }, config);
    };

    var makeStandardErrorWhileMakingCallInEmptyAndErrorStatesIsLoggedTest = function(method, args) {
        return function(queue) {
            expectAsserts(2);
            this.runMediaPlayerTest(queue, function (MediaPlayer) {
                var errorStub = this.sandbox.stub();
                this.sandbox.stub(this._device, "getLogger").returns({error: errorStub});
                this._mediaPlayer[method].apply(this._mediaPlayer, args);
                assert(errorStub.calledWith("Cannot " + method + " while in the 'EMPTY' state"));
                this._mediaPlayer[method].apply(this._mediaPlayer, args);
                assert(errorStub.calledWith("Cannot " + method + " while in the 'ERROR' state"));
            });
        };
    };

    //---------------------
    // HTML5 specific tests
    //---------------------

    this.HTML5MediaPlayerTests.prototype.testVideoElementCreatedWhenSettingSourceWithVideoType = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'testURL', 'video/mp4');

            assert(this._createElementStub.calledWith("video", "mediaPlayerVideo"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testAudioElementCreatedWhenSettingSourceWithAudioType = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.AUDIO, 'testURL', 'audio/mp4');

            assert(this._createElementStub.calledWith("audio", "mediaPlayerAudio"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testCreatedVideoElementIsPutAtBackOfDOM = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'testURL', 'video/mp4');

            var body = document.getElementsByTagName("body")[0];
            assertSame(stubCreateElementResults.video, body.firstChild);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testVideoElementIsRemovedFromDOMOnReset = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'testURL', 'video/mp4');
            this._mediaPlayer.reset();

            var searchResult = document.getElementById('mediaPlayerVideo');

            assertNull(searchResult);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testCreatedAudioElementIsPutAtBackOfDOM = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.AUDIO, 'testURL', 'audio/mp4');

            var body = document.getElementsByTagName("body")[0];
            assertSame(stubCreateElementResults.audio, body.firstChild);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testAudioElementIsRemovedFromDOMOnReset = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.AUDIO, 'testURL', 'audio/mp4');
            this._mediaPlayer.reset();

            var searchResult = document.getElementById('mediaPlayerAudio');

            assertNull(searchResult);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testSourceElementAddedToVideoOnSetSources = function(queue) {
        expectAsserts(3);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'testURL', 'video/mp4');

            assert(this._createElementStub.calledWith("source"));
            assertEquals(1, stubCreateElementResults.video.children.length);
            assertSame(stubCreateElementResults.source, stubCreateElementResults.video.firstChild);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testSourceURLSetOnSetSources = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            assertEquals('http://testurl/', stubCreateElementResults.source.src);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testSourceTypeSetOnSetSources = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            assertEquals('video/mp4', stubCreateElementResults.source.type);
        });
    };    

    this.HTML5MediaPlayerTests.prototype.testWeDoNotAccessSeekableRangesWhenThereAreNoSeekableRanges = function(queue) {
        expectAsserts(3);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            stubCreateElementResults.video.seekable.length = 0;
            assertUndefined(this._mediaPlayer.getRange());
            assert(stubCreateElementResults.video.seekable.start.notCalled);
            assert(stubCreateElementResults.video.seekable.end.notCalled);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testSeekableTimesObtainedFromFirstSeekableRange = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            stubCreateElementResults.video.seekable.length = 1;
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(0);
            this._mediaPlayer.getRange();
            assert(stubCreateElementResults.video.seekable.start.alwaysCalledWith(0));
            assert(stubCreateElementResults.video.seekable.end.alwaysCalledWith(0));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testWhenThereAreManySeekableRangesGetRangeReturnsUndefinedAndThisIsLogged = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            var warnStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({warn: warnStub});
            stubCreateElementResults.video.seekable.length = 2;
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(0);
            assertUndefined(this._mediaPlayer.getRange());
            assert(warnStub.calledWith("Multiple seekable ranges detected"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testWhenThereIsNoSeekablePropertyWeReturnUndefinedAndLogAWarning = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            var warnStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({warn: warnStub});
            delete stubCreateElementResults.video.seekable;
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(0);
            assertUndefined(this._mediaPlayer.getRange());
            assert(warnStub.calledWith("'seekable' property missing from media element"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testVideoElementIsFullScreen = function(queue) {
        expectAsserts(6);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            assertEquals("absolute", stubCreateElementResults.video.style.position);
            assertEquals("0px", stubCreateElementResults.video.style.top);
            assertEquals("0px", stubCreateElementResults.video.style.left);
            assertEquals("100%", stubCreateElementResults.video.style.width);
            assertEquals("100%", stubCreateElementResults.video.style.height);
            assertEquals("", stubCreateElementResults.video.style.zIndex);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testErrorWhileSettingSourceInInvalidStateIsLogged = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            var errorStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({error: errorStub});
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            assert(errorStub.calledWith("Cannot set source unless in the 'EMPTY' state"));
        });
    };
    
    this.HTML5MediaPlayerTests.prototype.testErrorWhilePlayingFromInInvalidStateIsLogged = makeStandardErrorWhileMakingCallInEmptyAndErrorStatesIsLoggedTest("playFrom", [0]);

    this.HTML5MediaPlayerTests.prototype.testErrorWhilePausingInInvalidStateIsLogged = makeStandardErrorWhileMakingCallInEmptyAndErrorStatesIsLoggedTest("pause");

    this.HTML5MediaPlayerTests.prototype.testErrorWhilePlayingInInvalidStateIsLogged = makeStandardErrorWhileMakingCallInEmptyAndErrorStatesIsLoggedTest("resume");

    this.HTML5MediaPlayerTests.prototype.testErrorWhileStoppingInInvalidStateIsLogged = makeStandardErrorWhileMakingCallInEmptyAndErrorStatesIsLoggedTest("stop");

    this.HTML5MediaPlayerTests.prototype.testErrorWhileResettingInInvalidStateIsLogged = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            var errorStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({error: errorStub});
            this._mediaPlayer.reset();
            assert(errorStub.calledWith("Cannot reset while in the 'EMPTY' state"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testAutoplayIsTurnedOffOnMediaElementCreation = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            assertBoolean(stubCreateElementResults.video.autoplay);
            assertFalse(stubCreateElementResults.video.autoplay);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testErrorEventFromMediaElementCausesErrorTransitionWithCodeLogged = function(queue) {
        expectAsserts(3);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {

            var errorStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({error: errorStub});

            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            assertFunction(mediaEventListeners.error);

            stubCreateElementResults.video.error =  { code: 2 }; // MEDIA_ERR_NETWORK - http://www.w3.org/TR/2011/WD-html5-20110405/video.html#dom-media-error

            deviceMockingHooks.emitPlaybackError(this._mediaPlayer);

            assertEquals(MediaPlayer.STATE.ERROR, this._mediaPlayer.getState());
            assert(errorStub.calledWith("Media element emitted error with code: 2"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testErrorEventFromSourceElementCausesErrorTransitionWithMessageLogged = function(queue) {
        expectAsserts(3);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {

            var errorStub = this.sandbox.stub();
            this.sandbox.stub(this._device, "getLogger").returns({error: errorStub});

            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            assertFunction(sourceEventListeners.error);

            var errorEvent = {
                type: "error",
                target: stubCreateElementResults.source
            };

            // We don't set the media element error object as we're emitting from the source, as if during the
            // resource selection algorithm, using source elements, when the resource fetch algorithm fails.
            // See http://www.w3.org/TR/2011/WD-html5-20110405/video.html#loading-the-media-resource

            sourceEventListeners.error(errorEvent);

            assertEquals(MediaPlayer.STATE.ERROR, this._mediaPlayer.getState());
            assert(errorStub.calledWith("Source element emitted error"));
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPausePassedThroughToMediaElementWhenInPlayingState = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            this._mediaPlayer.pause();

            assert(stubCreateElementResults.video.pause.calledOnce);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayCalledOnMediaElementWhenResumeInPausedState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(0);
            this._mediaPlayer.pause();
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            assertEquals(MediaPlayer.STATE.PAUSED, this._mediaPlayer.getState());

            this._mediaPlayer.resume();

            assert(stubCreateElementResults.video.play.calledTwice);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPausePassedThroughToMediaElementWhenInBufferedState = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(0);
            this._mediaPlayer.pause();
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            assert(stubCreateElementResults.video.pause.calledOnce);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testLoadCalledOnMediaElementWhenSetSourceIsCalled= function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            assert(stubCreateElementResults.video.load.calledOnce);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromSetsCurrentTimeAndCallsPlayOnMediaElementWhenInPlayingState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            this._mediaPlayer.playFrom(10);

            assert(stubCreateElementResults.video.play.calledTwice);
            assertEquals(10, stubCreateElementResults.video.currentTime);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromClampsWhenCalledInPlayingState = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            this._mediaPlayer.playFrom(110);

            assertEquals(100, stubCreateElementResults.video.currentTime);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromSetsCurrentTimeAndCallsPlayOnMediaElementWhenInCompleteState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            deviceMockingHooks.reachEndOfMedia(this._mediaPlayer);
            this._mediaPlayer.playFrom(10);

            assert(stubCreateElementResults.video.play.calledTwice);
            assertEquals(10, stubCreateElementResults.video.currentTime);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromSetsCurrentTimeAndCallsPlayOnMediaElementWhenInPausedState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            this._mediaPlayer.pause();
            this._mediaPlayer.playFrom(10);

            assert(stubCreateElementResults.video.play.calledTwice);
            assertEquals(10, stubCreateElementResults.video.currentTime);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromSetsCurrentTimeAndCallsPlayOnMediaElementWhenInStoppedState = function(queue) {
        expectAsserts(7);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(50);
            assertFalse(stubCreateElementResults.video.play.called);
            assertEquals(MediaPlayer.STATE.BUFFERING, this._mediaPlayer.getState());
            assertUndefined(stubCreateElementResults.video.currentTime);

            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            assertTrue(stubCreateElementResults.video.play.called);
            assertEquals(MediaPlayer.STATE.BUFFERING, this._mediaPlayer.getState());
            assertEquals(50, stubCreateElementResults.video.currentTime);

            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            assertEquals(MediaPlayer.STATE.PLAYING, this._mediaPlayer.getState());
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromClampsWhenCalledInStoppedState = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');
            this._mediaPlayer.playFrom(110);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            assertEquals(100, stubCreateElementResults.video.currentTime);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromThenPauseSetsCurrentTimeAndCallsPauseOnMediaElementWhenInStoppedState = function(queue) {
        expectAsserts(8);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(50);            
            this._mediaPlayer.pause();

            assertFalse(stubCreateElementResults.video.play.called);
            assertFalse(stubCreateElementResults.video.pause.called);
            assertEquals(MediaPlayer.STATE.BUFFERING, this._mediaPlayer.getState());
            assertUndefined(stubCreateElementResults.video.currentTime);

            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            assertTrue(stubCreateElementResults.video.pause.called);
            assertEquals(MediaPlayer.STATE.BUFFERING, this._mediaPlayer.getState());
            assertEquals(50, stubCreateElementResults.video.currentTime);
            sinon.assert.callOrder(stubCreateElementResults.video.play, stubCreateElementResults.video.pause);

            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            assertEquals(MediaPlayer.STATE.PAUSED, this._mediaPlayer.getState());
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayFromZeroThenPauseDefersCallToPauseOnMediaElementWhenInStoppedState = function(queue) {
        expectAsserts(1);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            this._mediaPlayer.pause();
            assertFalse(stubCreateElementResults.video.pause.called);
        });
    };

   this.HTML5MediaPlayerTests.prototype.testPlayNotCalledWhenSeekToTimeIsGreaterThanRangeEndWhenInStoppedState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(101);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);

            assertEquals(100, stubCreateElementResults.video.currentTime);
            assertFalse(stubCreateElementResults.video.play.called);
        });
    };

    this.HTML5MediaPlayerTests.prototype.testPlayNotCalledWhenSeekToTimeIsGreaterThanRangeEndWhenInPlayingState = function(queue) {
        expectAsserts(2);
        this.runMediaPlayerTest(queue, function (MediaPlayer) {
            this._mediaPlayer.setSource(MediaPlayer.TYPE.VIDEO, 'http://testurl/', 'video/mp4');

            this._mediaPlayer.playFrom(0);
            deviceMockingHooks.sendMetadata(this.mediaPlayer, 0, { start: 0, end: 100 });
            deviceMockingHooks.finishBuffering(this.mediaPlayer);
            
            this._mediaPlayer.playFrom(101);
            
            assertEquals(100, stubCreateElementResults.video.currentTime);
            assert(stubCreateElementResults.video.play.calledOnce);
        });
    };

    // WARNING WARNING WARNING WARNING: These TODOs are NOT exhaustive.    
    // TODO: playFrom(...) actually plays, from specified point.
    //   While playing *DONE*
    //   While stopped *DONE*
    //   While buffering
    //   While buffering and new seek point is immediately available
    //   While paused *DONE*
    //   While complete *DONE*
    // TODO: Ensure playFrom(...) clamps to the available range (there's a _getClampedTime helper in the MediaPlayer)
    //   While playing *DONE*
    //   While stopped *DONE*
    //   While buffering
    //   While buffering and new seek point is immediately available
    //   While paused *DONE*
    //   While complete *DONE*
    // TODO: stop() actually stops.
    // TODO: reset() clears down all event listeners (to prevent memory leaks from DOM object and JavaScript keeping each other in scope)
    // TODO: Resolve all FIXMEs & TODOs in production code base
    // TODO: Consider the implications of no autoplaying and if that implies we should use the preload attribute http://www.w3.org/TR/2011/WD-html5-20110405/video.html#loading-the-media-resource
    // TODO: Handle an error event on media load http://www.w3.org/TR/2011/WD-html5-20110405/video.html#loading-the-media-resource
    // TODO: Ensure that when getting the source when it contains an apostorophe is escaped (see devices/media/html5.js:166)
    // TODO: Ensure that the "src" attribute is removed from the audio/media element on tear-down (see device/media/html5.js:331 and chat with Tom W in iPlayer)
    //       "... [we should handle this] by being very careful about removing all references to the element and allowing it to be garbage collected, or, even better, by removing the element's src attribute and any source element descendants, and invoking the element's load() method."
    //          -- http://www.w3.org/TR/2011/WD-html5-20110405/video.html#best-practices-for-authors-using-media-elements
    //   !! Note: this effectively flips the 'html5memoryleakfix' behaviour to be the default. As a result, we may need to make a sub-modifier for the old behaviour... :-)
    // TODO: Ensure any media AND source elements, media AND source event listeners/callbacks are destroyed on reset() to help avoid memory leaks.
    // TODO: Ensure playback events handled if/as required
    // TODO: Ensure all errors are logged.
    // Update CATAL videoplayer.js new media 'SEEK to END' button, it doesn't need to subtract a second from the end time any more.
    // ? Do we want any 'mini-integration' tests as part of the UT suite: PC suggests using removeTestsForIncompatibleDevices() and having device specific integration tests...

    //---------------------
    // Common tests
    //---------------------

    // Mixin the common tests shared by all MediaPlayer implementations (last, so it can detect conflicts)
    MixinCommonMediaTests(this.HTML5MediaPlayerTests, "antie/devices/mediaplayer/html5", config, deviceMockingHooks);

})();
