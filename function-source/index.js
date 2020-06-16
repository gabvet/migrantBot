// See https://github.com/dialogflow/dialogflow-fulfillment-nodejs
// for Dialogflow fulfillment library docs, samples, and to report issues
'use strict';
 
const functions = require('firebase-functions');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Image, Card, Suggestion, Payload} = require('dialogflow-fulfillment');
const vega = require('vega');
const lite = require('vega-lite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment =  functions.region('europe-west2').https.onRequest ((request, response) => {
    const agent = new WebhookClient({ request, response });
    console.log('Dialogflow Request headers: ' + JSON.stringify(request.headers));
    console.log('Dialogflow Request body: ' + JSON.stringify(request.body));

    /*
    Attraverso questa funzione creiamo il file immagine contenente il grafico a torta 
    relativo alle 8 categorie del questionario SF-36 attraverso le librerie di vega-lite e 
    canvas. Il calcolo dei valori del grafico è fatto acquisendo i parametri corrispondenti 
    alle risposte di ogni domanda attraverso il contesto 'sf36_data' e calcolando i risultati 
    relativi alle 8 categorie (phy_func, rlph, rlep, energy, ewb, soc_func, pain, gen_health).
    Dopo l'esecuzione delle precedenti operazioni, attraverso la funzione 
    'agent.setFollowupEvent('sf36_graphic')' viene richiamata l'esecuzione della funzione 
    successiva senza la necessità che venga inserito un input da parte dell'utente.
    
    [Per ovviare al problema del timeout di 5secondi impostato da Dialogflow e non modificabile, 
    è stato scelto di dividere la creazione dell'immagine e l'invio dei risultati all'utente]
    */
    async function sf36_results(agent) {
        let dataContext = agent.getContext('sf36_data');
        
        var phy_func = (dataContext.parameters.risposta3 + dataContext.parameters.risposta4 +
            dataContext.parameters.risposta5 + dataContext.parameters.risposta6 +
            dataContext.parameters.risposta7 + dataContext.parameters.risposta8 + 
            dataContext.parameters.risposta9 + dataContext.parameters.risposta10 + 
            dataContext.parameters.risposta11 + dataContext.parameters.risposta12)/10;

        var rlph = (dataContext.parameters.risposta13 + dataContext.parameters.risposta14 +
            dataContext.parameters.risposta15 + dataContext.parameters.risposta16)/4;
        
        var rlep = (dataContext.parameters.risposta17 + dataContext.parameters.risposta18 +
            dataContext.parameters.risposta19)/3;
    
        var energy = (dataContext.parameters.risposta23 + dataContext.parameters.risposta27 +
            dataContext.parameters.risposta29 + dataContext.parameters.risposta31)/4;
        
        var ewb = (dataContext.parameters.risposta24 + dataContext.parameters.risposta25 +
            dataContext.parameters.risposta26 + dataContext.parameters.risposta28 + 
            dataContext.parameters.risposta30)/5;
        
        var soc_func = (dataContext.parameters.risposta20 + dataContext.parameters.risposta32)/2;
        
        var pain = (dataContext.parameters.risposta21 + dataContext.parameters.risposta22)/2;
        
        var gen_health = (dataContext.parameters.risposta1 + dataContext.parameters.risposta33 +
            dataContext.parameters.risposta34 + dataContext.parameters.risposta35 + 
            dataContext.parameters.risposta36)/5;

        agent.add('Bene');
    
        const tempFilePath = path.join(os.tmpdir(), request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png');
        
        var yourVlSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
        width:300,
        height:300,
        data: {
            values: [
            {type: '1.Attività fisica', value: parseFloat(phy_func).toFixed(2)},
            {type: '2.Limitazioni di ruolo dovute alla salute fisica', value: parseFloat(rlph).toFixed(2)},
            {type: '3.Limitazioni di ruolo dovute allo stato emotivo', value: parseFloat(rlep).toFixed(2)},
            {type: '8.Vitalità', value: parseFloat(energy).toFixed(2)},
            {type: '5.Salute mentale', value: parseFloat(ewb).toFixed(2)},
            {type: '6.Attività sociali', value: parseFloat(soc_func).toFixed(2)},
            {type: '7.Dolore fisico', value: parseFloat(pain).toFixed(2)},
            {type: '4.Percezione dello stato di salute generale', value: parseFloat(gen_health).toFixed(2)}
            ]
        },
        layer:[
            {
                layer: [{
                    mark: {type: 'arc', stroke: '#fff'}
                },{
                    mark: {type: 'text', radiusOffset: 30, fontSize: 20},
                    encoding: {
                    text: {field: 'value', type: 'quantitative'}
                    }
                }],
                encoding: {
                    theta: {field: 'type', type: 'nominal', stack: true, sort:{field:'value', order:'ascending'}},
                    radius: {field: 'value', type: 'quantitative', scale: {type: 'sqrt', zero: true, domain:[0,100]}},
                    color: {field: 'type', type: 'nominal', legend: {title:'Categoria', orient:'bottom', direction: 'vertical', labelLimit: 500, labelFontSize: 14, titleFontSize: 16, symbolSize: 200}} 
                },
            },
            {
            mark:{type:'arc', color:'gray', opacity: 0.03, innerRadius: 148}
            }
        ],
        view: {stroke: null}
        };
        
        let vegaspec = lite.compile(yourVlSpec).spec;
        var view = new vega.View(vega.parse(vegaspec), {renderer: "none"});
        var buffer;
        await view.toCanvas()
            .then(function(canvas) {
                canvas.createJPEGStream().pipe(fs.createWriteStream(tempFilePath));
                agent.setFollowupEvent('sf36_graphic');       		 	
            }).catch(function(err) { console.error(err); });
    }

    /*
    Attraverso questa funzione:
        -salviamo i risultati delle 8 categorie del questionario SF-36 nel database Firebase, 
        -inviamo un messaggio all'utente con i risultati delle 8 categorie del SF-36 in 
         forma testuale,
        -carichiamo l'immagine creata dalla funzione 'sf36_results nel firebase storage per 
        essere successivamente accessibile dal client di Telegram,
        -inviamo un messaggio all'utente con i risultati delle 8 categorie dell'SF-36 in 
         forma grafica, inviando il link dell'immagine caricata, visualizzato nel client
         di Telegram come un'immagine.
    */
    async function sf36_graphic(agent) {
        let dataContext = agent.getContext('sf36_data');
        
        var phy_func = (dataContext.parameters.risposta3 + dataContext.parameters.risposta4 +
            dataContext.parameters.risposta5 + dataContext.parameters.risposta6 +
            dataContext.parameters.risposta7 + dataContext.parameters.risposta8 + 
            dataContext.parameters.risposta9 + dataContext.parameters.risposta10 + 
            dataContext.parameters.risposta11 + dataContext.parameters.risposta12)/10;
        
        var rlph = (dataContext.parameters.risposta13 + dataContext.parameters.risposta14 +
            dataContext.parameters.risposta15 + dataContext.parameters.risposta16)/4;
        
        var rlep = (dataContext.parameters.risposta17 + dataContext.parameters.risposta18 +
            dataContext.parameters.risposta19)/3;
    
        var energy = (dataContext.parameters.risposta23 + dataContext.parameters.risposta27 +
            dataContext.parameters.risposta29 + dataContext.parameters.risposta31)/4;
        
        var ewb = (dataContext.parameters.risposta24 + dataContext.parameters.risposta25 +
            dataContext.parameters.risposta26 + dataContext.parameters.risposta28 + 
            dataContext.parameters.risposta30)/5;
        
        var soc_func = (dataContext.parameters.risposta20 + dataContext.parameters.risposta32)/2;
        
        var pain = (dataContext.parameters.risposta21 + dataContext.parameters.risposta22)/2;
        
        var gen_health = (dataContext.parameters.risposta1 + dataContext.parameters.risposta33 +
            dataContext.parameters.risposta34 + dataContext.parameters.risposta35 + 
            dataContext.parameters.risposta36)/5;
        
        var ts = new Date();
        const userId = request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString();
        const docRef = db.collection('sf36').doc(userId+'_'+ts.toISOString());
        docRef.set({
            user: userId,
            date: ts.toLocaleString(),
            phy_func: phy_func,
            rlph: rlph,
            rlep: rlep,
            energy: energy,
            ewb: ewb,
            soc_func: soc_func,
            pain: pain,
            gen_health: gen_health
        });
        
        agent.add('Attività fisica: ' + parseFloat(phy_func).toFixed(2) + '%\n' + 
            'Limitazioni di ruolo dovute alla salute fisica: ' + parseFloat(rlph).toFixed(2) + '%\n' +
            'Limitazioni di ruolo dovute allo stato emotivo: ' + parseFloat(rlep).toFixed(2)+ '%\n' +
            'Vitalità: ' + parseFloat(energy).toFixed(2)+ '%\n' +
            'Salute mentale: ' + parseFloat(ewb).toFixed(2)+ '%\n' +
            'Attività sociali: ' + parseFloat(soc_func).toFixed(2)+ '%\n' +
            'Dolore fisico: ' + parseFloat(pain).toFixed(2)+ '%\n' +
            'Percezione dello stato di salute generale: ' + parseFloat(gen_health).toFixed(2)+ '%\n');
        agent.add(new Payload(agent.TELEGRAM, {
            "text": "Con questi valori puoi valutare la tua salute!",
            "reply_markup": {
                "one_time_keyboard": true,
                "resize_keyboard": true,
                "keyboard": [
                    [
                        {
                        "text": "Torna alla home 🏠"
                        }
                    ]
                ]
            }
        } , {sendAsMessage: true}));
        
        const tempFilePath = path.join(os.tmpdir(), request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png');
        const storageBucket = admin.storage().bucket( 'gs://botsysag.appspot.com' );

        await storageBucket.upload(tempFilePath).then(data => {
            console.log('upload success');
            
            }	).catch(err => {
            console.log('error uploading to storage', err);});

            ts = Date.now();
            agent.add(new Image('https://firebasestorage.googleapis.com/v0/b/botsysag.appspot.com/o/' + request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png?alt=media&' + ts));
    }
    
    /*
    Attraverso questa funzione creiamo il file immagine contenente il grafico a torta 
    relativo alle 2 categorie del questionario SF-12 attraverso le librerie di vega-lite e 
    canvas. Il calcolo dei valori del grafico è fatto acquisendo i parametri corrispondenti 
    alle risposte di ogni domanda attraverso il contesto 'sf12_data' e calcolando i risultati 
    relativi alle 2 categorie (MCS12, PCS12).
    Dopo l'esecuzione delle precedenti operazioni, attraverso la funzione 
    'agent.setFollowupEvent('sf12_graphic')' viene richiamata l'esecuzione della funzione 
    successiva senza la necessità che venga inserito un input da parte dell'utente.
    
    [Per ovviare al problema del timeout di 5secondi impostato da Dialogflow e non modificabile, 
    è stato scelto di dividere la creazione dell'immagine e l'invio dei risultati all'utente]
    */
    async function sf12_results(agent) {
        let dataContext = agent.getContext('sf12_data');
        
        let GH1 = dataContext.parameters.GH1;
        let PF02 = dataContext.parameters.PF02;
        let PF04 = dataContext.parameters.PF04;
        let RP2 = dataContext.parameters.RP2;
        let RP3 = dataContext.parameters.RP3;
        let RE2 = dataContext.parameters.RE2;
        let RE3 = dataContext.parameters.RE3;
        let BP2 = dataContext.parameters.BP2;
        let MH3 = dataContext.parameters.MH3;
        let VT2 = dataContext.parameters.VT2;
        let MH4 = dataContext.parameters.MH4;
        let SF2 = dataContext.parameters.SF2;
        
        var PF02_1, PF02_2, PF04_1, PF04_2, RP2_1, RP3_1, BP2_1, BP2_2, BP2_3, BP2_4, GH1_1, GH1_2, GH1_3, GH1_4, VT2_1,  VT2_2, VT2_3, VT2_4, VT2_5, SF2_1, SF2_2, SF2_3, SF2_4, RE2_1, RE3_1, MH3_1, MH3_2, MH3_3, MH3_4, MH3_5, MH4_1, MH4_2, MH4_3, MH4_4, MH4_5;
        PF02_1 = 0;
        PF02_2 = 0;
        PF04_1 = 0;
        PF04_2 = 0;
        RP2_1 = 0;
        RP3_1 = 0;
        BP2_1 = 0;
        BP2_2 = 0;
        BP2_3 = 0;
        BP2_4 = 0;
        GH1_1 = 0;
        GH1_2 = 0;
        GH1_3 = 0;
        GH1_4 = 0;
        VT2_1 = 0;
        VT2_2 = 0;
        VT2_3 = 0;
        VT2_4 = 0;
        VT2_5 = 0;
        SF2_1 = 0;
        SF2_2 = 0;
        SF2_3 = 0;
        SF2_4 = 0;
        RE2_1 = 0;
        RE3_1 = 0;
        MH3_1 = 0;
        MH3_2 = 0;
        MH3_3 = 0;
        MH3_4 = 0;
        MH3_5 = 0;
        MH4_1 = 0;
        MH4_2 = 0;
        MH4_3 = 0;
        MH4_4 = 0;
        MH4_5 = 0;
    
        var RBP2 = 6-BP2;
        var RGH1 = 6-GH1;
        var RVT2 = 7-VT2;
        var RMH3 = 7-MH3;
        
        if (PF02 == 1) {
            PF02_1 = 1;
        } else if (PF02 == 2) {
            PF02_2 = 1;
        }
        
        if (PF04 == 1) {
            PF04_1 = 1;
        } else if (PF04 == 2) {
            PF04_2 = 1;
        }
        
        if (RP2 == 1) {
            RP2_1 = 1;
        }
        
        if (RP3 == 1) {
            RP3_1 = 1;
        }
        
        if (RBP2 == 1) {
            BP2_1 = 1;
        } else if (RBP2 == 2) {
            BP2_2 = 1;
        } else if (RBP2 == 3) {
            BP2_3 = 1;
        } else if (RBP2 == 4) {
            BP2_4 = 1;
        }
        
        if (RGH1 == 1) {
            GH1_1 = 1;
        } else if (RGH1 == 2) {
            GH1_2 = 1;
        } else if (RGH1 == 3) {
            GH1_3 = 1;
        } else if (RGH1 == 4) {
            GH1_4 = 1;
        }
        
        if (RVT2 == 1) {
            VT2_1 = 1;
        } else if (RVT2 == 2) {
            VT2_2 = 1;
        } else if (RVT2 == 3) {
            VT2_3 = 1;
        } else if (RVT2 == 4) {
            VT2_4 = 1;
        } else if (RVT2 == 5) {
            VT2_5 = 1;
        }
        
        if (SF2 == 1) {
            SF2_1 = 1;
        } else if (SF2 == 2) {
            SF2_2 = 1;
        } else if (SF2 == 3) {
            SF2_3 = 1;
        } else if (SF2 == 4) {
            SF2_4 = 1;
        }
        
        if (RE2 == 1) {
            RE2_1 = 1;
        }
        
        if (RE3 == 1) {
            RE3_1 = 1;
        }
        
        if (RMH3 == 1) {
            MH3_1 = 1;
        } else if (RMH3 == 2) {
            MH3_2 = 1;
        } else if (RMH3 == 3) {
            MH3_3 = 1;
        } else if (RMH3 == 4) {
            MH3_4 = 1;
        } else if (RMH3 == 5) {
            MH3_5 = 1;
        }
        
        if (MH4 == 1) {
            MH4_1 = 1;
        } else if (MH4 == 2) {
            MH4_2 = 1;
        } else if (MH4 == 3) {
            MH4_3 = 1;
        } else if (MH4 == 4) {
            MH4_4 = 1;
        } else if (MH4 == 5) {
            MH4_5 = 1;
        }
        
        var RAWPCS12 = (-7.23216*PF02_1) + (-3.45555*PF02_2) +
            (-6.24397*PF04_1) + (-2.73557*PF04_2) + (-4.61617*RP2_1) +
            (-5.51747*RP3_1) + (-11.25544*BP2_1) + (-8.38063*BP2_2) +
            (-6.50522*BP2_3) + (-3.80130*BP2_4) + (-8.37399*GH1_1) +
            (-5.56461*GH1_2) + (-3.02396*GH1_3) + (-1.31872*GH1_4) +
            (-2.44706*VT2_1) + (-2.02168*VT2_2) + (-1.6185*VT2_3) +
            (-1.14387*VT2_4) + (-0.42251*VT2_5) + (-0.33682*SF2_1) +
            (-0.94342*SF2_2) + (-0.18043*SF2_3) + (0.11038*SF2_4) +
            (3.04365*RE2_1) + (2.32091*RE3_1) + (3.46638*MH3_1) +
            (2.90426*MH3_2) + (2.37241*MH3_3) + (1.36689*MH3_4) +
            (0.66514*MH3_5) + (4.61446*MH4_1) + (3.41593*MH4_2) +
            (2.34247*MH4_3) + (1.28044*MH4_4) + (0.41188*MH4_5);

        var RAWMCS12 = (3.93115*PF02_1) + (1.8684*PF02_2) +
            (2.68282*PF04_1) + (1.43103*PF04_2) + (1.4406*RP2_1) +
            (1.66968*RP3_1) + (1.48619*BP2_1) + (1.76691*BP2_2) +
            (1.49384*BP2_3) + (0.90384*BP2_4) + (-1.71175*GH1_1) +
            (-0.16891*GH1_2) + (0.03482*GH1_3) + (-0.06064*GH1_4) +
            (-6.02409*VT2_1) + (-4.88962*VT2_2) + (-3.29805*VT2_3) +
            (-1.65178*VT2_4) + (-0.92057*VT2_5) + (-6.29724*SF2_1) +
            (-8.26066*SF2_2) + (-5.63286*SF2_3) + (-3.13896*SF2_4) +
            (-6.82672*RE2_1) + (-5.69921*RE3_1) + (-10.19085*MH3_1) +
            (-7.92717*MH3_2) + (-6.31121*MH3_3) + (-4.09842*MH3_4) +
            (-1.94949*MH3_5) + (-16.15395*MH4_1) + (-10.77911*MH4_2) +
            (-8.09914*MH4_3) + (-4.59055*MH4_4) + (-1.95934*MH4_5);

        var PCS12 = RAWPCS12 + 56.57706;
        var MCS12 = RAWMCS12 + 60.75781;
        
        const tempFilePath = path.join(os.tmpdir(), request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png');
        
        var yourVlSpec = {
            $schema: 'https://vega.github.io/schema/vega-lite/v4.json',
            data: {
                values:[
                    {name:'Score salute fisica', value:parseFloat(PCS12).toFixed(2)},
                    {name:'Score salute mentale', value:parseFloat(MCS12).toFixed(2)}
                ]
            },
            height: {step: 50},
            mark: {type: 'bar', yOffset: 5, cornerRadiusEnd: 2},
            encoding: {
                y: {
                    field: 'name',
                    type: 'nominal',
                    band: 0.5,
                    title: null,
                    axis: {
                        domain: false,
                        ticks: false,
                        labelAlign: 'left',
                        labelPadding: -2,
                        labelOffset: -15,
                        titleAlign: 'left',
                        labelFontSize: 15
                    }
                },
                x: {
                    field: 'value',
                    type: 'quantitative',
                    scale :{domain: [0,100]},
                    title: null
                },
                color:{
                    field: 'name',
                    type: 'nominal',
                    legend: null
                }
            }
        };
        let vegaspec = lite.compile(yourVlSpec).spec;
        var view = new vega.View(vega.parse(vegaspec), {renderer: "none"});
        var buffer;
        await view.toCanvas()
            .then(function(canvas) {
            canvas.createJPEGStream().pipe(fs.createWriteStream(tempFilePath));
            agent.add("");
            agent.setFollowupEvent('sf12_graphic');    		 	
        }).catch(function(err) { console.error(err); });
    }

    /*
    Attraverso questa funzione:
        -salviamo i risultati delle 8 categorie del questionario SF-12 nel database Firebase, 
        -inviamo un messaggio all'utente con i risultati delle 2 categorie del SF-12 in 
         forma testuale,
        -carichiamo l'immagine creata dalla funzione 'sf12_results nel firebase storage per 
         essere successivamente accessibile dal client di Telegram,
        -inviamo un messaggio all'utente con i risultati delle 2 categorie dell'SF-12 in 
         forma grafica, inviando il link dell'immagine caricata, visualizzato nel client
         di Telegram come un'immagine.
        -Se i risultati del questionario hanno una media inferiore al 40% (scelto perché 
         individuato come punteggio medio degli indicatori dello stato di salute [min: 21.52%, 
         max: 58.75%] relativamente ai valori del questionario SF-12) viene poi richiesto 
         all’utente di poter effettuare ulteriori domande attraverso la somministrazione 
         del questionario SF-36. 
    */
    async function sf12_graphic(agent) {
        let dataContext = agent.getContext('sf12_data');
        
        let GH1 = dataContext.parameters.GH1;
        let PF02 = dataContext.parameters.PF02;
        let PF04 = dataContext.parameters.PF04;
        let RP2 = dataContext.parameters.RP2;
        let RP3 = dataContext.parameters.RP3;
        let RE2 = dataContext.parameters.RE2;
        let RE3 = dataContext.parameters.RE3;
        let BP2 = dataContext.parameters.BP2;
        let MH3 = dataContext.parameters.MH3;
        let VT2 = dataContext.parameters.VT2;
        let MH4 = dataContext.parameters.MH4;
        let SF2 = dataContext.parameters.SF2;
        
        var PF02_1, PF02_2, PF04_1, PF04_2, RP2_1, RP3_1, BP2_1, BP2_2, BP2_3, BP2_4, GH1_1, GH1_2, GH1_3, GH1_4, VT2_1,  VT2_2, VT2_3, VT2_4, VT2_5, SF2_1, SF2_2, SF2_3, SF2_4, RE2_1, RE3_1, MH3_1, MH3_2, MH3_3, MH3_4, MH3_5, MH4_1, MH4_2, MH4_3, MH4_4, MH4_5;
        PF02_1 = 0;
        PF02_2 = 0;
        PF04_1 = 0;
        PF04_2 = 0;
        RP2_1 = 0;
        RP3_1 = 0;
        BP2_1 = 0;
        BP2_2 = 0;
        BP2_3 = 0;
        BP2_4 = 0;
        GH1_1 = 0;
        GH1_2 = 0;
        GH1_3 = 0;
        GH1_4 = 0;
        VT2_1 = 0;
        VT2_2 = 0;
        VT2_3 = 0;
        VT2_4 = 0;
        VT2_5 = 0;
        SF2_1 = 0;
        SF2_2 = 0;
        SF2_3 = 0;
        SF2_4 = 0;
        RE2_1 = 0;
        RE3_1 = 0;
        MH3_1 = 0;
        MH3_2 = 0;
        MH3_3 = 0;
        MH3_4 = 0;
        MH3_5 = 0;
        MH4_1 = 0;
        MH4_2 = 0;
        MH4_3 = 0;
        MH4_4 = 0;
        MH4_5 = 0;
    
        var RBP2 = 6-BP2;
        var RGH1 = 6-GH1;
        var RVT2 = 7-VT2;
        var RMH3 = 7-MH3;
        
        if (PF02 == 1) {
            PF02_1 = 1;
        } else if (PF02 == 2) {
            PF02_2 = 1;
        }
        
        if (PF04 == 1) {
            PF04_1 = 1;
        } else if (PF04 == 2) {
            PF04_2 = 1;
        }
        
        if (RP2 == 1) {
            RP2_1 = 1;
        }
        
        if (RP3 == 1) {
            RP3_1 = 1;
        }
        
        if (RBP2 == 1) {
            BP2_1 = 1;
        } else if (RBP2 == 2) {
            BP2_2 = 1;
        } else if (RBP2 == 3) {
            BP2_3 = 1;
        } else if (RBP2 == 4) {
            BP2_4 = 1;
        }
        
        if (RGH1 == 1) {
            GH1_1 = 1;
        } else if (RGH1 == 2) {
            GH1_2 = 1;
        } else if (RGH1 == 3) {
            GH1_3 = 1;
        } else if (RGH1 == 4) {
            GH1_4 = 1;
        }
        
        if (RVT2 == 1) {
            VT2_1 = 1;
        } else if (RVT2 == 2) {
            VT2_2 = 1;
        } else if (RVT2 == 3) {
            VT2_3 = 1;
        } else if (RVT2 == 4) {
            VT2_4 = 1;
        } else if (RVT2 == 5) {
            VT2_5 = 1;
        }
        
        if (SF2 == 1) {
            SF2_1 = 1;
        } else if (SF2 == 2) {
            SF2_2 = 1;
        } else if (SF2 == 3) {
            SF2_3 = 1;
        } else if (SF2 == 4) {
            SF2_4 = 1;
        }
        
        if (RE2 == 1) {
            RE2_1 = 1;
        }
        
        if (RE3 == 1) {
            RE3_1 = 1;
        }
        
        if (RMH3 == 1) {
            MH3_1 = 1;
        } else if (RMH3 == 2) {
            MH3_2 = 1;
        } else if (RMH3 == 3) {
            MH3_3 = 1;
        } else if (RMH3 == 4) {
            MH3_4 = 1;
        } else if (RMH3 == 5) {
            MH3_5 = 1;
        }
        
        if (MH4 == 1) {
            MH4_1 = 1;
        } else if (MH4 == 2) {
            MH4_2 = 1;
        } else if (MH4 == 3) {
            MH4_3 = 1;
        } else if (MH4 == 4) {
            MH4_4 = 1;
        } else if (MH4 == 5) {
            MH4_5 = 1;
        }
        
        var RAWPCS12 = (-7.23216*PF02_1) + (-3.45555*PF02_2) +
            (-6.24397*PF04_1) + (-2.73557*PF04_2) + (-4.61617*RP2_1) +
            (-5.51747*RP3_1) + (-11.25544*BP2_1) + (-8.38063*BP2_2) +
            (-6.50522*BP2_3) + (-3.80130*BP2_4) + (-8.37399*GH1_1) +
            (-5.56461*GH1_2) + (-3.02396*GH1_3) + (-1.31872*GH1_4) +
            (-2.44706*VT2_1) + (-2.02168*VT2_2) + (-1.6185*VT2_3) +
            (-1.14387*VT2_4) + (-0.42251*VT2_5) + (-0.33682*SF2_1) +
            (-0.94342*SF2_2) + (-0.18043*SF2_3) + (0.11038*SF2_4) +
            (3.04365*RE2_1) + (2.32091*RE3_1) + (3.46638*MH3_1) +
            (2.90426*MH3_2) + (2.37241*MH3_3) + (1.36689*MH3_4) +
            (0.66514*MH3_5) + (4.61446*MH4_1) + (3.41593*MH4_2) +
            (2.34247*MH4_3) + (1.28044*MH4_4) + (0.41188*MH4_5);

        var RAWMCS12 = (3.93115*PF02_1) + (1.8684*PF02_2) +
            (2.68282*PF04_1) + (1.43103*PF04_2) + (1.4406*RP2_1) +
            (1.66968*RP3_1) + (1.48619*BP2_1) + (1.76691*BP2_2) +
            (1.49384*BP2_3) + (0.90384*BP2_4) + (-1.71175*GH1_1) +
            (-0.16891*GH1_2) + (0.03482*GH1_3) + (-0.06064*GH1_4) +
            (-6.02409*VT2_1) + (-4.88962*VT2_2) + (-3.29805*VT2_3) +
            (-1.65178*VT2_4) + (-0.92057*VT2_5) + (-6.29724*SF2_1) +
            (-8.26066*SF2_2) + (-5.63286*SF2_3) + (-3.13896*SF2_4) +
            (-6.82672*RE2_1) + (-5.69921*RE3_1) + (-10.19085*MH3_1) +
            (-7.92717*MH3_2) + (-6.31121*MH3_3) + (-4.09842*MH3_4) +
            (-1.94949*MH3_5) + (-16.15395*MH4_1) + (-10.77911*MH4_2) +
            (-8.09914*MH4_3) + (-4.59055*MH4_4) + (-1.95934*MH4_5);

        var PCS12 = RAWPCS12 + 56.57706;
        var MCS12 = RAWMCS12 + 60.75781;
        
        var ts = new Date();
        const userId = request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString();
        const docRef = db.collection('sf12').doc(userId+'_'+ts.toISOString());
        docRef.set({
            user: userId,
            date: ts.toLocaleString(),
            PCS12: PCS12,
            MCS12: MCS12
        });
        
        agent.add('Score salute fisica PCS12: ' + parseFloat(PCS12).toFixed(2) + '%');
        agent.add('Score salute mentale MCS12: ' + parseFloat(MCS12).toFixed(2) + '%');
        
        const tempFilePath = path.join(os.tmpdir(), request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png');
        const storageBucket = admin.storage().bucket( 'gs://botsysag.appspot.com' );

        await storageBucket.upload(tempFilePath).then(data => {
            console.log('upload success');
        }).catch(err => {console.log('error uploading to storage', err);});

        ts = Date.now();
        agent.add(new Image('https://firebasestorage.googleapis.com/v0/b/botsysag.appspot.com/o/' + request.body.originalDetectIntentRequest.payload.data.callback_query.from.id.toString() + '.png?alt=media&' + ts));

        if ((PCS12+MCS12)/2 < 40) {
            agent.add(new Payload(agent.TELEGRAM, {
                "text": "Grazie, ora per capire meglio devo farti qualche altra domanda. Vuoi?",
                "reply_markup": {
                    "inline_keyboard": [
                        [
                            {
                            "text": "Si",
                            "callback_data": "SF36"
                            }
                        ],
                        [
                            {
                            "callback_data": "Preferisco non continuare",
                            "text": "No"
                            }
                        ]
                    ]
                }
            } , {sendAsMessage: true}));
        }
        else{
            agent.add(new Payload(agent.TELEGRAM, {
                "text": "Nel compleso la tua salute mi sembra buona, stai tranquillo! ☺️",
                "reply_markup": {
                    "one_time_keyboard": true,
                    "resize_keyboard": true,
                    "keyboard": [
                        [
                            {
                            "text": "Torna alla home 🏠"
                            }
                        ]
                    ]
                }
            } , {sendAsMessage: true}));
        }
    }
    
    /*
    Attraverso questa funzione controlliamo se l'utente è già registrato con il proprio id 
    Telegram, controllando se questo id esiste nella collezione 'users' del database. 
    Se così non fosse, l'utente è rimandato alla registrazione.
    */
    function start(agent){
        const userId = request.body.originalDetectIntentRequest.payload.data.from.id.toString();
        const docRef = db.collection('users').doc(userId);

        return docRef.get().then(doc => {
            if (!doc.exists) {
                agent.add('Benvenuto in MigrantBot! Potresti dirmi come ti chiami?');
                agent.context.set('register', 1, {'param1':1});
            } 
            else {
                var name=doc.get('name'); 

                agent.add(new Payload(agent.TELEGRAM, {
                    "text": "Bentornato " + name + "\nSono MigrantBot 🤖, con me puoi chiacchierare per controllare"  + 
                        " il tuo stato di salute oppure per avere informazioni sulle procedure di accoglienza per" + 
                        " i migranti richiedenti asilo.\nCosa vuoi fare oggi?",
                    "reply_markup": {
                        "inline_keyboard": [
                            [
                                {
                                    "callback_data": "Faq",
                                    "text": "Voglio farti una domanda 💬"
                                }
                            ],
                            [
                                {
                                    "text": "Voglio un check sulla mia salute 🩺",
                                    "callback_data": "Voglio un check sulla mia salute"
                                }
                            ]
                        ]
                    }
                } , {sendAsMessage: true}));       
            }
            return Promise.resolve('Read complete');
        }).catch(() => {
            agent.add('Error reading entry from the Firestore database.');
            agent.add('Please add a entry to the database first by saying, "Write <your phrase> to the database"');
        });
    }

    /*
    Con questa funzione viene effettuata la registrazione dell'utente nel database. 
    Questa avviene salvando id Telegram, nome e codice fiscale dell'utente.
    */
    function registration(agent){
        const userId = request.body.originalDetectIntentRequest.payload.data.from.id.toString();
        const docRef = db.collection('users').doc(userId);
    
        let name = agent.parameters["person"][0]["name"];
        
        docRef.set({
            name: name,
            code: agent.parameters["code"]
        });
        
        agent.add(new Payload(agent.TELEGRAM, {
            "text": "Benvenuto " + name + "\nSono MigrantBot 🤖, con me puoi chiacchierare per controllare" + 
                " il tuo stato di salute oppure per avere informazioni sulle procedure di accoglienza per" + 
                " i migranti richiedenti asilo.\nCosa vuoi fare oggi?",
            "reply_markup": {
                "inline_keyboard": [
                    [
                        {
                        "callback_data": "Faq",
                        "text": "Voglio farti una domanda 💬"
                        }
                    ],
                    [
                        {
                        "text": "Voglio un check sulla mia salute 🩺",
                        "callback_data": "Voglio un check sulla mia salute"
                        }
                    ]
                ]
            }
        } , {sendAsMessage: true}));       
    }

    /*
    Attraverso la funzione intentMap.set(['NomeFunzione'],[NomeIntento]) viene 
    associato ad ogni intento la funzione che verrà eseguita ogni volta che avviene
    il "match" con il relativo intento.
    */

    let intentMap = new Map();
        
    intentMap.set('SF36_Results', sf36_results);
    intentMap.set('SF36_Graphic', sf36_graphic);
    intentMap.set('SF12_Results', sf12_results);
    intentMap.set('SF12_Graphic', sf12_graphic);
    intentMap.set('0_StartBot', start);
    intentMap.set('1_Registration', registration);

    agent.handleRequest(intentMap);
});
