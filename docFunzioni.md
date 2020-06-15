# Documentazione Funzioni

##### `async function sf36_results(agent)`  
Attraverso questa funzione creiamo il file immagine contenente il grafico a torta 
relativo alle 8 categorie del questionario SF-36 attraverso le librerie di vega-lite e 
canvas. Il calcolo dei valori del grafico è fatto acquisendo i parametri corrispondenti 
alle risposte di ogni domanda attraverso il contesto 'sf36_data' e calcolando i risultati 
relativi alle 8 categorie (phy_func, rlph, rlep, energy, ewb, soc_func, pain, gen_health).
Dopo l'esecuzione delle precedenti operazioni, attraverso la funzione 
'agent.setFollowupEvent('sf36_graphic')' viene richiamata l'esecuzione della funzione 
successiva senza la necessità che venga inserito un input da parte dell'utente.  
*Per ovviare al problema del timeout di 5 secondi impostato da Dialogflow e non modificabile, 
è stato scelto di dividere la creazione dell'immagine e l'invio dei risultati all'utente*  
  
##### `async function sf36_graphic(agent)`  
Attraverso questa funzione:
- salviamo i risultati delle 8 categorie del questionario SF-36 nel database Firebase, 
- inviamo un messaggio all'utente con i risultati delle 8 categorie del SF-36 in 
 forma testuale,
- carichiamo l'immagine creata dalla funzione 'sf36_results nel firebase storage per 
essere successivamente accessibile dal client di Telegram,
- inviamo un messaggio all'utente con i risultati delle 8 categorie dell'SF-36 in 
 forma grafica, inviando il link dell'immagine caricata, visualizzato nel client
 di Telegram come un'immagine.  
   
##### `async function sf12_results(agent)`  
Attraverso questa funzione creiamo il file immagine contenente il grafico a torta 
relativo alle 2 categorie del questionario SF-12 attraverso le librerie di vega-lite e 
canvas. Il calcolo dei valori del grafico è fatto acquisendo i parametri corrispondenti 
alle risposte di ogni domanda attraverso il contesto 'sf12_data' e calcolando i risultati 
relativi alle 2 categorie (MCS12, PCS12).
Dopo l'esecuzione delle precedenti operazioni, attraverso la funzione 
'agent.setFollowupEvent('sf12_graphic')' viene richiamata l'esecuzione della funzione 
successiva senza la necessità che venga inserito un input da parte dell'utente.
*Per ovviare al problema del timeout di 5secondi impostato da Dialogflow e non modificabile, 
è stato scelto di dividere la creazione dell'immagine e l'invio dei risultati all'utente*  
   
##### `async function sf12_graphic(agent)`  
Attraverso questa funzione:
- salviamo i risultati delle 8 categorie del questionario SF-12 nel database Firebase, 
- inviamo un messaggio all'utente con i risultati delle 2 categorie del SF-12 in 
 forma testuale,
- carichiamo l'immagine creata dalla funzione 'sf12_results nel firebase storage per 
 essere successivamente accessibile dal client di Telegram,
- inviamo un messaggio all'utente con i risultati delle 2 categorie dell'SF-12 in 
 forma grafica, inviando il link dell'immagine caricata, visualizzato nel client
 di Telegram come un'immagine.
- Se i risultati del questionario hanno una media inferiore al 40% (scelto perché 
 individuato come punteggio medio degli indicatori dello stato di salute [min: 21.52%, 
 max: 58.75%] relativamente ai valori del questionario SF-12) viene poi richiesto 
 all’utente di poter effettuare ulteriori domande attraverso la somministrazione 
 del questionario SF-36.  
   
##### `function start(agent)`
Attraverso questa funzione controlliamo se l'utente è già registrato con il proprio id 
Telegram, controllando se questo id esiste nella collezione 'users' del database. 
Se così non fosse, l'utente è rimandato alla registrazione.  
  
##### `function registration(agent)`  
Con questa funzione viene effettuata la registrazione dell'utente nel database.  
Questa avviene salvando id Telegram, nome e codice fiscale dell'utente.  

##### `intentMap.set(['NomeFunzione'],[NomeIntento])`
Attraverso la funzione intentMap.set(['NomeFunzione'],[NomeIntento]) viene 
associato ad ogni intento la funzione che verrà eseguita ogni volta che avviene
il "match" con il relativo intento.
