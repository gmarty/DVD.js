// Output HTML tags given the content of a metadata file.

'use strict';


function buildTag(metadata) {
  return '<x-video controls style="width: 720px; height: 480px;">' +
    metadata
      .map(function(videos, id) {
        return buildXMenuTag(videos, id) +
          buildVideoTag(videos, id);
      })
      .join('') +
    '</x-video>';

  function buildXMenuTag(videos, id) {
    var lang = 'en';
    var tpl = '';

    for (var lang in videos.menu) {
      videos.menu[lang].forEach(function(menu) {
        var cellID = menu.cellID;
        var vobID = menu.vobID;

        tpl += '<x-menu id="menu-' + lang + '-' + menu.pgc + '" lang="' + lang + '">';

        if (cellID !== null || vobID !== null) {

          var menuCell = videos.menuCell['' + cellID]['' + vobID];

          if (menuCell.btn_nb > 0) {
            tpl += '<link href="' + menuCell.css + '" rel="stylesheet">' +
              '<img src="' + menuCell.still + '">';

            for (var i = 0; i < menuCell.btn_nb; i++) {
              tpl += '<input type="button" data-id="' + i + '" class="btn">';
            }
          }
        }

        tpl += '</x-menu>';
      });
    }

    return tpl;
  }

  function buildVideoTag(videos, id) {
    if (!(videos.video && videos.video.length) && !((videos.vtt && videos.vtt.length))) {
      return '';
    }

    return '<video id="video-' + id + '"' +
      (videos.video && videos.video.length ?
        ' src="' + videos.video[0] + '"' : '') +
      '>' +
      (videos.vtt && videos.vtt.length ?
        buildTracksTag(videos.vtt) : '') +
      '</video>';
  }

  function buildTracksTag(tracks) {
    return tracks
      .map(function(track, index) {
        var defaultAttr = '';
        if (index === 0) {
          defaultAttr = ' default'
        }
        return '<track kind="chapters" src="' + track + '" srclang="en"' +
          defaultAttr + '/>'
      })
      .join();
  }
}
