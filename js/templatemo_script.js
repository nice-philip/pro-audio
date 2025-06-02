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
        if (!href || href === "#") return null;
        var item = $(href);
        return item.length ? item : null;
    }).get();

    // Bind click handler to menu items
	  // so we can get a fancy scroll animation
    menuItems.click(function(e){
        var href = $(this).attr("href");
        if (href && href !== "#") {
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
    $("#responsive-menu").css({"right":-1500});
    $("#mobile_menu").click(function(){
        $("#responsive-menu").show();
        $("#responsive-menu").animate({"right":0});
        return false;
    });
    $(window).on("load resize", function(){
        if($(window).width()>768){
            $("#responsive-menu").css({"right":-1500});
        }
    });

    $("#responsive-menu a").click(function(){
      $("#responsive-menu").hide();
  });

})(jQuery);

/* Google map
------------------------------------------------*/
var map = '';
var center;

function initialize() {
    const mapCanvas = document.getElementById('map-canvas');
    if (mapCanvas) {
        mapCanvas.innerHTML = '<div style="text-align: center; padding: 20px;">Google Maps is temporarily disabled</div>';
        mapCanvas.style.backgroundColor = '#f5f5f5';
        mapCanvas.style.border = '1px solid #ddd';
    }
}

function calculateCenter() {
  center = map.getCenter();
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
  });
  $('.templatemo-album').mouseout(function(){
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
  $('#map-canvas').height($('.tm-contact-form').height());
});