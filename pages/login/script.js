// Login page script


    // Buttons
            var loginBtn=document.querySelector("#loginButton");
            loginBtn.addEventListener("click", checkLogin);

            var manageBtn=document.querySelector("#manageButton");
            manageBtn.addEventListener("click", showPopup);

            var freeBtn = document.querySelector("#freeButton");
            freeBtn.addEventListener("click", whenClicked);
            
            var proBtn=document.querySelector("#proButton");
            proBtn.addEventListener("click", whenClicked);
            
            var premiumBtn=document.querySelector("#premiumButton");
            premiumBtn.addEventListener("click", whenClicked);

            var freeCol=document.querySelector("#freeColumn");
            var proCol=document.querySelector("#proColumn");
            var premiumCol=document.querySelector("#premiumColumn");

            var closeBtn=document.querySelector("#closeButton");
            closeBtn.addEventListener("click", closePopup);

    // Function: Matching Username and Password before logging in
        function checkLogin() {
            var usernameTyped=document.querySelector("#usernameInput").value;
            var errorText1=document.querySelector("#error1");
            var passwordTyped=document.querySelector("#passwordInput").value;
            var errorText2=document.querySelector("#error2");
            var successText=document.querySelector("#success");

        // Clearing error message when Login button is clicked again
            errorText1.textContent = "";
            errorText2.textContent = "";
            successText.textContent = "";

            if(usernameTyped==="admin" && passwordTyped!=="1234"){
                errorText2.textContent="Incorrect password";
            }
            else if(usernameTyped!=="admin" && passwordTyped==="1234"){
                errorText1.textContent="Incorrect username";
            }
            else if(usernameTyped!=="admin" && passwordTyped!=="1234"){
                errorText1.textContent="Incorrect username";
                errorText2.textContent="Incorrect password";
            }
            else {
                successText.textContent="IT WORKED!";
                document.querySelector("#loginArea").classList.add("hidden");
                document.querySelector("#profileArea").classList.remove("hidden");            
            }
        }

    // Function to SHOW the popup
        function showPopup() {
            document.querySelector("#subscriptionPopup").classList.remove("hidden");
        }

        function resetPlanStates() {
            freeCol.style.border="1px solid #ddd";
            proCol.style.border="1px solid #ddd";
            premiumCol.style.border="1px solid #ddd";

            freeBtn.style.backgroundColor="";
            proBtn.style.backgroundColor="";
            premiumBtn.style.backgroundColor="";

            freeBtn.value="Change to Free"; 
            proBtn.value="Change to Pro";
            premiumBtn.value="Change to Premium";
            
            freeBtn.disabled=false;
            proBtn.disabled=false;
            premiumBtn.disabled=false;
        }

    // Function to Upgrade subscription
        function whenClicked() {
            resetPlanStates();
            var ans=document.querySelector("#ansbox");
            ans.textContent="Subscription Updated!";
            ans.style.color="#00FF5E";

            var planText=document.querySelector("#currentPlanText");

            if (this.id==="freeButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Current Plan: Free Tier";
                freeCol.style.border="3px solid #00FF5E";
            } 

            else if (this.id==="proButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Current Plan: Pro Tier";
                proCol.style.border="3px solid #00FF5E";
            }

            else if (this.id==="premiumButton") {
                this.value="Current Plan";              
                this.disabled=true;    
                planText.textContent="Current Plan: Premium Tier";
                premiumCol.style.border="3px solid #00FF5E";
            }

        }

    // Function to CLOSE the popup
        function closePopup() {
            document.querySelector("#subscriptionPopup").classList.add("hidden");
        }

