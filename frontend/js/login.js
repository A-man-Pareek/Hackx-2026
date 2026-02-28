const signInButton = document.getElementById("signIn");
const signUpButton = document.getElementById("signUp");
const container = document.getElementById("container");
const startLoginBtn = document.getElementById("startLoginBtn");
const mainWrapper = document.getElementById("mainWrapper");
const brandIntro = document.getElementById("brandIntro");

startLoginBtn.addEventListener("click", () => {
    // Hide the brand intro container
    brandIntro.style.opacity = "0";
    setTimeout(() => {
        brandIntro.style.display = "none";
        // Show the main wrapper
        mainWrapper.style.display = "block";
        setTimeout(() => {
            mainWrapper.classList.add("show");
        }, 50); // Small delay to allow display block to take effect
    }, 300); // Wait for the fade-out transition
});

signUpButton.addEventListener("click", () => {
    container.classList.add("right-panel-active");
});
signInButton.addEventListener("click", () => {
    container.classList.remove("right-panel-active");
});