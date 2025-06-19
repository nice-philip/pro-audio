(function($) {

	"use strict";
	
	  // Cache selectors
    var lastId,
    topMenu = $(".menu-holder"),
    topMenuHeight = 50,
    // All list items
    menuItems = topMenu.find("a"),
    // Anchors corresponding to menu items
    scrollItems = menuItems.map(function(){
        var href = $(this).attr("href");
        if(!href) return null;
        if(href.startsWith('#')) {
            var item = $(href);
            return item.length ? item : null;
        }
        return null;
    }).get().filter(Boolean);

    // Bind click handler to menu items
	  // so we can get a fancy scroll animation
    menuItems.click(function(e){
        var href = $(this).attr("href");
        if (href && href.startsWith('#')) {
            var offsetTop = $(href).offset().top - topMenuHeight + 1;
            $('html, body').stop().animate({ 
                scrollTop: offsetTop
            }, 300);
            e.preventDefault();
        }
    });
	  
    // Bind to scroll
    $(window).scroll(function(){
      // Get container scroll position
      var fromTop = $(this).scrollTop() + topMenuHeight;
       
      // Get id of current scroll item
      var cur = scrollItems.map(function(item){
        if ($(item).offset().top < fromTop)
          return item;
      });
      
      // Get the id of the current element
      cur = cur[cur.length-1];
      var id = cur && cur.length ? cur[0].id : "";
       
      if (lastId !== id && id != "") {
        lastId = id;
        // Set/remove active class
        menuItems
         .parent().removeClass("active")
         .end().filter("[href='#"+id+"']").parent().addClass("active");
      }

      /* Change navigation header on scroll
      -------------------------------------- */
      if ($(this).scrollTop() > $('.templatemo-header-image').height() - 50){  
        $('.templatemo-header').addClass("sticky");
      }
      else {
        $('.templatemo-header').removeClass("sticky");
      }
   });

    //mobile menu and desktop menu
    var $responsiveMenu = $("#responsive-menu");
    $responsiveMenu.hide().css({"right":-1500});
    $("#mobile_menu").click(function(e){
        e.preventDefault();
        $responsiveMenu.show().animate({"right":0}, 300);
    });
    $(window).on("load resize", function(){
        if($(window).width() > 768){
            $responsiveMenu.hide().css({"right":-1500});
        }
    });

    $("#responsive-menu a").click(function(){
        $responsiveMenu.animate({"right":-1500}, 300, function() {
            $(this).hide();
        });
    });

})(jQuery);

/* Google map
------------------------------------------------*/
var map = '';
var center;

function initialize() {
    // 지도 초기화 로직은 index.html의 initMap() 함수에서 처리
}

function calculateCenter() {
    if (map && typeof map.getCenter === 'function') {
        center = map.getCenter();
    }
}

function loadGoogleMap() {
    initialize();
}

function scrollToTop() {
    $('html, body').animate({scrollTop : 0},800);
    return false;
}

$(function(){
  /* Album image
  -----------------------------------*/
  $('.templatemo-album').mouseover(function(){
    $('.templatemo-album-img-frame', this).attr('src', 'images/circle_blue.png');
  }).mouseout(function(){
    $('.templatemo-album-img-frame', this).attr('src', 'images/circle_gray.png');
  });

  /* Go to top button click handler
  ----------------------------------- */
  $('.tm-go-to-top').click(scrollToTop);
  $('.templatemo-site-name').click(scrollToTop);

    /* Map
  -----------------------------------*/
  loadGoogleMap();
  // Make sure map's height is the same as form height in all browsers
  var $mapCanvas = $('#map-canvas');
  var $contactForm = $('.tm-contact-form');
  if ($mapCanvas.length && $contactForm.length) {
    $mapCanvas.height($contactForm.height());
  }
});