# DVD.js

> Playing DVD in JavaScript for the sake of interoperability

## Talk

For more details on this project, have a look at the [video of the talk I gave
at JS Conf 2014](https://www.youtube.com/watch?v=lb-8euLqfRg).

[The slide deck](https://gmarty.github.io/jsconf-2014-talk-play-dvd-in-js/) is
also available.

## Approach

This branch contains the DVD converter. For the attempt to play DVD on-the-fly,
look into the `master` branch.

I ported libdvdread and libdvdnav to JavaScript. Several passes are applied to
the content of a DVD to make it playable on a browser using native features:

1. IFO files are parsed to JSON
2. Chapters are generated as WebVTT
3. NAV packets are extracted to JSON
4. The buttons size/position are saved to CSS
5. The menu still frames are saved to PNG
6. VM commands are compiled into JavaScript
7. The video is encoded to Webm

## Support

All browsers supporting the following features:

* `<video>` tag
* `<track>` tag and WebVTT.

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
