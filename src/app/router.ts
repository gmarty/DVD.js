/* global Backbone, $, init, fp_pgc */

/// <reference path="../references.ts" />
/// <reference path="../declarations/underscore/underscore.d.ts" />
/// <reference path="../declarations/backbone/backbone.d.ts" />

'use strict';

// A router using Backbone and jQuery to list the DVD and display a player.

interface Window { dvd: Element; }
interface vmProceduresInterface { (): void; }
declare var init: vmProceduresInterface;
declare var fp_pgc: vmProceduresInterface;

var listTpl = _.template('<ul>' +
  '<% _.each(dvds, function(dvd) {%>' +
  '<li class="thumbnail" style="background-image:url(\'<%= dvd.dir %>/cover.jpg\');">' +
  '<a href="#/play/<%= dvd.dir %>"><span><%= dvd.name %></span></a>' +
  '</li>' +
  '<% }); %>' +
  '</ul>');

class App extends Backbone.Router {
  routes: any;
  constructor(options?: Backbone.RouterOptions) {
    this.routes = {
      'play': 'list',
      'play/:dvdId': 'play'
    };
    super(options);
  }
  list() {
    $.getJSON('/dvds.json')
      .done(function(data) {
        data = data.sort(function(a, b) {
          return a.name > b.name;
        });
        $('.video-container').html(listTpl({dvds: data}));
      });
  }
  play(dvdId: string) {
    $.getJSON('/' + dvdId + '/web/metadata.json')
      .done(function(data) {
        $('.video-container').html(buildTag(data));

        var g = document.createElement('script');
        var s = document.scripts[0];
        g.src = dvdId + '/web/vm.js';
        s.parentNode.insertBefore(g, s);
        g.onload = function() {
          console.log('Start the DVD.');
          window.dvd = document.querySelector('x-video');

          init();

          // When everything is loaded and ready, start the playback.
          fp_pgc();
        };
      });
  }
}

Backbone.history.start();

var app = new App();

// Always execute the `play` route when starting.
app.navigate('play', {trigger: true});
