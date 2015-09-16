// Output HTML tags given the content of a metadata file.

'use strict';


function buildTag(metadata) {
  return `<x-video controls style="width: 100%; max-width: 720px; max-height: 480px;">` +
    metadata
      .map((videos, id) => {
        return buildXMenuTag(videos, id) + buildVideoTag(videos, id);
      })
      .join(``) +
    `</x-video>`;

  function buildXMenuTag(videos, id) {
    var tpl = ``;

    for (var lang in videos.menu) {
      videos.menu[lang].forEach(menu => {
        var cellID = menu.cellID;
        var vobID = menu.vobID;

        tpl += `<x-menu id="menu-${lang}-${id}-${menu.pgc}"
          data-domain="${id}" data-cell="${cellID}" data-vob="${vobID}"
          lang="${lang}">`;

        if (cellID !== null || vobID !== null) {
          var menuCell = videos.menuCell[String(cellID)][String(vobID)];

          if (menuCell.btn_nb > 0) {
            tpl += `<link href="${menuCell.css}" rel="stylesheet"><img src="${menuCell.still}">`;

            for (var i = 0; i < menuCell.btn_nb; i++) {
              tpl += `<input type="button" data-id="${i}" class="btn">`;
            }
          }
        }

        tpl += `</x-menu>`;
      });
    }

    return tpl;
  }

  function buildVideoTag(videos, id) {
    if (!(videos.video && videos.video.length) && !(videos.vtt && videos.vtt.length)) {
      return ``;
    }

    var src = (videos.video && videos.video.length) ? ` src="${videos.video[0]}"` : ``;
    var vtt = (videos.vtt && videos.vtt.length) ? buildTracksTag(videos.vtt) : ``;

    return `<video id="video-${id}"${src}>${vtt}</video>`;

    function buildTracksTag(tracks) {
      return tracks
        .map((track, index) => {
          var attr = (index === 0) ? ` default` : ``;

          return `<track kind="chapters" src="${track}" srclang="en"${attr}/>`;
        })
        .join(``);
    }
  }
}
