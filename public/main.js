

let navbar = document.querySelector(".nav-bar");

window.addEventListener("scroll", () => { 
    if (window.scrollY > 50) { 
        navbar.classList.add("nav-bar-scrolled"); 
        navbar.classList.remove("nav-bar-top"); 
    } else { 
        navbar.classList.add("nav-bar-top"); 
        navbar.classList.remove("nav-bar-scrolled"); 
    } 
});