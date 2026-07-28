(function () {
    var lightLink = document.getElementById("theme-light");
    var darkLink = document.getElementById("theme-dark");

    function setTheme(theme) {
        document.documentElement.classList.toggle("dark", theme === "dark");
        localStorage.setItem("theme", theme);
    }

    lightLink.addEventListener("click", function (e) {
        e.preventDefault();
        setTheme("light");
    });
    darkLink.addEventListener("click", function (e) {
        e.preventDefault();
        setTheme("dark");
    });
})();
