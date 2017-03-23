import { Component, OnInit, EventEmitter, Output } from '@angular/core';
import {Filter} from "../filter/filter.component";

@Component({
    selector: 'big-datatable',
    templateUrl: './big-datatable.component.html',
    inputs: ['bigdata'],
    outputs: ['message'],
    styleUrls: ['./big-datatable.component.css']
})

/**
 * Datatable à utiliser au lieu des datatables classiques lorsque le volume des données est trop important.
 * Pour la structure, plusieurs états de "cellule" sont possible :
 *    state = 1 => Etat normal, on affiche simplement le texte dans le "<th>"
 *    state = 2 => Etat html, on affiche du HTML (avec innerHTML)
 *    state = 3 => On applique une fonction de callback sur le(s) élement(s). Possibilité d'appliquer un split sur une chaîne.
 *
 * Il est également possible de définir une taille au celule, les différentes valeurs actuellement possible (en %) sont :
 *  - 1
 *  - 2
 *  - 3
 *  - 5
 *  - 7
 *  - 10
 *  - 15
 *  - 20
 *  - 25
 *  Si des boutons sont renseignés, une colonne d'une taille fixe de 7% leur sera attribué.
 *
 *  Exemple de configuration :
 *
 *  public config = {
        _service: this._ShortcutService,                        // Le service qui postera les données.
        _service_method: this._ShortcutService.postFilter,      // La méthode qui est appellée par le service ci-dessus.
        filter_has_display_items: true,                         // FACULTATIF, DEFAULT = false, Si true, alors dans le filtre il y a un champs de type number qui
                                                                //                              contient le nombre d'élement par page.
        display_items_name                                      // FACULTATIF, DEFAULT = display_items. C'est le nom du champs qui contient le nombre d'élement par page.
        is_filter: false,                                       // FACULTATIF, DEFAULT = true. Si false, alors on n'aura pas de filtre à l'écran.
        pagination_config: {                                    // FACULTATIF, Attention, une pagination sera quand même mise en place en prenant les propriétés par défaut du composant Pagination.
            'pagination_top': true,                             // FACULTATIF, DEFAULT = false. Si true, la pagination apparaitra en haut.
            'pagination_bottom': true,                          // FACULTATIF, DEFAULT = true. Si true, la pagination apparaitra en bas.
            'max_page': 271,                                    // FACULTATIF, DEFAULT = 1. Le nombre de page.
            'item_per_page': 10,                                // FACULTATIF, DEFAULT = 10. Le nombre d'élement par page.
            'page':1,                                           // FACULTATIF, DEFAULT = 1. La page courante.
            'delta':5,                                          // FACULTATIF, DEFAULT = 5. Le nombre de page suivant et précédent this.page.
        },

        buttons:                                                // Tableau contenant les boutons.
            [
                {
                    'text': '<span class="iconclasses fa fa-pencil" aria-hidden="true"></span>',        // Le texte du bouton.
                    'action': this.edit,                                                                // La méthode appellée lors du clic sur le bouton. (appellée sur bigdata.parent_scope)
                    'class': "btn btn-warning"                                                          // La classe du bouton.
                }
            ],


        structure:                                              // La structure du tableau.
        [
            // Champs avec une pipe :
            { id: "url_source",        label: "URL Source",    size: 15, pipe: new TruncateWithTooltipPipe, params: 50, state: 2},

            // Champs "normale" :
            { id: 'redirection_label', label: 'Redirection',   size: 11},

            // Champs avec function :
            { id: 'tags_list',         label: 'Tag(s)',        size: 10, function_type: 'split', separator:',', class:'tag_list hover', function: this.addFilterTag, state:3},
        ],


        filter_config: {}                                       // FACULTATIF (Seulement si on a définit is_filter à false). Pour voir comment le configurer => Composant Filter.
 *
 */

export class BigDatatableComponent implements OnInit {

    public bigdata: BigDatatable;
    @Output() message = new EventEmitter();  // Renvoie une string success ou error.

    constructor() {}

    ngOnInit() {
        this.bigdata.setMessage(this.message);
    }

    ngOnDestroy() {
        this.bigdata.subscriptions.forEach((sub) => {
            sub.unsubscribe();
        });
    }

}

export class BigDatatable {

    public subscriptions = [];            // Le tableau des subscriptions.
    public colspan:number;                // Le nombre de colonne que y a dans le tableau.

    // Config global
    public parent_scope;                  // L'objet parent (dans lequel on appelle ce composant).
    public scope = this;                  // L'objet this.
    public config;                        // La config globale.

    // Tous ce qui est configuration de la pagination.
    public pagination_config;             // La configuration du composant <pagination> (contient max_page, item_per_page
    public pagination_top = false;        // Si false, on aura une pagination en haut.
    public pagination_bottom = true;      // Si true, on aura une pagination en bas.

    // Le filtre.
    public filter:Filter;                 // Le filtre.
    public filter_config;                 // La configuration du filtre.
    public is_filter:boolean = true;      // Si true, alors le filtre est présent. Sinon on laisse juste en place une pagination basique.

    // Config de la datatable.
    public structure;                     // Les noms des champs.
    public data = [];                     // Les données qui vont être affichées.
    public buttons;                       // Les boutons qui seront TOUJOURS dans la dernière colonne.

    private _service;                     // Le service qui est utilisé pour récupérer les ressources.
    private _service_method;              // La méthode qu'il faut appeller du service pour récupérer les ressources.

    private message:EventEmitter<any>;    // Renvoie une string success ou error.

    private default_pagination = {        // Les propriétés de la pagination de base si on en a pas précisé.
        delta:5,
        max_page:1,
        page:1,
    };

    constructor(config, structure, scope) {
        this.config = config;
        this.structure = structure;
        this.parent_scope = scope;

        // Si on a pas d'état dans les celules, alors on le mets à 1 par défaut.
        this.checkStructure();

        // On récupère la config de la pagination.
        if(!this.config.pagination_config) this.config.pagination_config = this.default_pagination;
        this.pagination_config = this.config.pagination_config;
        this.pagination_config.callback = this.pageChange;

        // On récupère la config du filtre.
        if(this.config.filter_config) this.filter_config = this.config.filter_config;
        if(this.config.filter_config) this.filter_config.callback = this.postFilter;
        if(this.config.is_filter) this.is_filter = this.config.is_filter;

        // Le service & sa méthode.
        this._service = this.config._service;
        this._service_method = this.config._service_method;

        // On vérifie quelques petits détails de configuration.

        if(!this.config.pagination_config.delta) this.config.pagination_config.delta = 5;                                               // Delta de base : 5.
        if(this.config.pagination_config.pagination_top) this.pagination_top = this.config.pagination_config.pagination_top;            // Pagination du haut.
        if(this.config.pagination_config.pagination_bottom) this.pagination_bottom = this.config.pagination_config.pagination_bottom;   // Pagination du bas.
        if(!this.config.filter_has_display_items) this.config.filter_has_display_items = false; // Si on veut permettre à l'utilisateur de changer le nombre d'élement par page.
        if(!this.config.display_items_name) this.config.display_items_name = 'display_items';   // Le nom du champs dans le filtre qui contient le nombre d'élement par page.
        this.colspan = this.structure.length + (this.config.buttons ? 1 : 0);

        // Les boutons
        if(this.config.buttons) this.buttons = this.config.buttons;

        // Création du filtre.
        this.filter = new Filter(this.scope, this.filter_config);
    }

    /**
     * La fonction de callback de la pagination.
     * @param page
     */
    public pageChange(page: number) {
        this.pagination_config.page = page;
        this.postFilter();
    }

    /**
     * La fonction qui s'occupe de poster le filtre & la pagination.
     */
    public postFilter() {

        if(this.config.filter_has_display_items) {
            // Pas besoin de vérifier du côté serveur qu'on divise par un nombre négatif ou par 0.
            if(this.filter_config.property[this.config.display_items_name].value > 0) {
                this.pagination_config.item_per_page = this.filter_config.property[this.config.display_items_name].value;
            }
        }
        let toPost = { 'filter': this.filter_config, 'pagination': this.pagination_config };
        let sub = this._service_method.apply(this._service, [toPost]).subscribe(
            result => {
                this.data = [];
                this.pagination_config = result['pagination'];
                this.pagination_config.callback = this.pageChange;
                for(let object of result['objects']) {
                    this.data.push(object);
                }
                this.message.emit('success');
            },
            err => {
                this.message.emit('error');
            }
        );
        this.subscriptions.push(sub);
    }

    /**
     * Vérifie la structure.
     * Enfaite, si on a pas renseigné "state" pour une celule, on le définit à 1 par défaut.
     */
    private checkStructure() {
        for(let i = 0; i < this.structure.length; i++) {
            if(typeof this.structure[i].state === 'undefined') {
                this.structure[i].state = 1;
            }
        }
    }

    public setMessage(message:EventEmitter<any>) {
        this.message = message;
    }
}