# DVD.js

> Playing DVD in JavaScript for the sake of interoperability

## Talk

For more details on this project, have a look at the [video of the talk I gave
at JS Conf 2014](https://www.youtube.com/watch?v=lb-8euLqfRg).

[The slide deck](https://gmarty.github.io/jsconf-2014-talk-play-dvd-in-js/) is
also available.

## Approach

This *deprecated* branch contains the original attempt to play DVD in the
browser on-the-fly. It turns out it's not quite possible right now.

For the DVD converter that is currently being worked on, look into the
[`converter` branch](https://github.com/gmarty/DVD.js/tree/converter).

I ported libdvdread and libdvdnav to JavaScript. This project uses a server /
client architecture. Communication is achieved via binary WebSockets.

* Client:
    * parses IFO files
    * runs the VM
    * requests portions of the video (assembled using Media Source Extension)
    * decodes the subpictures (not implemented yet)
* Server:
    * sends IFO files
    * sends bits of preencoded video to Webm
    * extracts and sends the NAV packets from VOB files

## Support

* Chrome desktop
* Firefox desktop (requires the `media.mediasource.enabled` flag to be
activated)
* IE11 on Windows 8 (untested + webm plugin required)
* Opera desktop > 15 (probably)

## FAQ

### Do you need help?

Yes, please, use it, open issues and send pull requests.

### Why doing that?

There are several reasons:

* I am frustrated with the current VOD offer and I don't want to watch movies
or TV series on my mobile if I already own the DVD.
* I noticed I'm listening to my CD more often now that I'm using Google Play
Music and am looking for a similar solution for my DVD.

### Why don't you just convert the video for the web?

There's more in DVD than the video. You can select audio track, subtitles,
navigate through the menu, play interactive game or browse a gallery of still
images.

### Why not using Emscripten?

I wanted to understand the logic in the JavaScript.

Also I don't do C and wasn't even able to compile the programs coming with
libdvdread and libdvdnav on my PC... ^^;
