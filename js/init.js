

(function($){
  $(function(){

    $('.sidenav').sidenav();
    $('.parallax').parallax();
    $('.collapsible').collapsible();
    $('.chart').easyPieChart({
      animate: 5000,
      scaleColor: false,
      size: 160,
      lineWidth: 25,
      lineCap: 'butt',
      barColor: "#00838f"
  });

  }); // end of document ready
})(jQuery); // end of jQuery name space
