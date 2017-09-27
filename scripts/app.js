if ('serviceWorker' in navigator) {
     navigator.serviceWorker
             .register('./sw.js')
             .then(function() 
                    { console.log('Service Worker Registered'); 
             });

	navigator.serviceWorker
             .register('./firebase-messaging-sw.js')
             .then(function() 
                    { console.log('Firebase Service Worker Registered'); 
             });
}