# MigrantBot - Guida all'installazione

### Import degli intenti
Dopo aver creato un nuovo progetto in DialogFlow, sarà necessario recarsi nelle impostazioni del progetto -> *Export and Import* -> *Restore from zip*, e lì sarà necessario caricare la versione compressa (zip) della directory 'dialogflow' all'interno di questo repository.

### Import del fulfilment
Per importare il fulfilment sarà necessario copiare e incollare il codice contenuto nella directory 'function-source' all'interno dell'editor di codice (*Inline Editor*) in 'Fulfilment' di Dialogflow dei rispettivi file *index.js* e *package.json*.  
**ATTENZIONE:** sarà necessario avere attivo un account di Google Cloud Platform prima di abilitare l'opzione *Inline Editor*.
