# DVD.js

> Playing DVD in JavaScript for the sake of interoperability

## Talk

For more details on this project, have a look at the [video of the talk I gave
at JS Conf 2014](https://www.youtube.com/watch?v=lb-8euLqfRg).

[The slide deck](https://gmarty.github.io/jsconf-2014-talk-play-dvd-in-js/) is
also available.

## Approach

This branch, named `converter`, contains an encoder of DVD to web format. For
the attempt to play DVD on-the-fly, look into the `master` branch.

I ported libdvdread and libdvdnav to JavaScript. Several passes are applied to
the content of a DVD to make it playable on a browser using native features:

1. IFO files are parsed to JSON
2. Chapters are generated as WebVTT
3. NAV packets are extracted to JSON
4. The buttons size/position are saved to CSS
5. The menu still frames are saved to PNG (to be done)
6. VM commands are compiled into JavaScript
7. The video is encoded to Webm

## Install

Clone the repo locally and install the dependencies with:
```bash
$ npm install
$ bower install
```

You'll need to install the latest version of [ffmpeg](http://ffmpeg.org/).

Then, compile the TS files to JavaScript with:
```bash
$ grunt
```

If you see a message saying 'Done, without errors' then the compilation to
JavaScript was successful.

Create the folder that will hold your DVD, e.g.:
```bash
$ cd /home/user/
$ mkdir dvd
$ pwd
/home/user/dvd
```

Then update the `dvdPath` property of the config file in `config/app.json` to
match the path to the folder created above.

Copy an unprotected DVD into a subfolder of `dvd/` (e.g. in
`/home/user/dvd/Sita Sings the Blues/`)

To convert the DVD, do:
```bash
$ node bin/convert /home/user/dvd/Sita Sings the Blues/
```

Wait for a while (reencoding video takes a loooooong time).

Start the web server:
```bash
node bin/http-server
```

Finally, point your browser to:
```
http://localhost:3000/
```

... and enjoy your DVD from your browser!

## Support

All browsers supporting the following features:

* `<video>` tag
* `<track>` tag and WebVTT.

## FAQ

### Do you need help?

Yes, please, use it, open issues and send pull requests.

### Why doing that?

There are several reasons:

* I am frustrated with the current VOD offer and I don't want to buy movies
or TV series to watch on my mobile if I already own the DVD.
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
