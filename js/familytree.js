// extend javascript array class by a remove function
// copied from https://stackoverflow.com/a/3955096/12267732
Array.prototype.remove = function() {
    var what, a = arguments,
        L = a.length,
        ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};


function d3_append_multiline_text(d3element, text, delimiter = "_", css_class = undefined, line_sep = 14,
    line_offset = undefined, x = 13, dominant_baseline = "central") {
    // adds a multi-line text label to a d3 element
    if (!text) return;
    const d3text = d3element.append("text")
        .attr("class", css_class)
        .attr("dominant-baseline", dominant_baseline);
    const arr = text.split(delimiter);
    if (!line_offset) { line_offset = -line_sep * (arr.length - 1) / 2; }
    if (arr != undefined) {
        for (i = 0; i < arr.length; i++) {
            d3text.append("tspan")
                .text(arr[i])
                .attr("dy", i == 0 ? line_offset : line_sep)
                .attr("x", x);
        }
    }
};

class FTDataHandler {

    constructor(data, start_node_id = data.start) {

        // check if edge list defined
        if (data.links.length > 0) {

            // make dag from edge list
            this.dag = d3.dagConnect()(data.links);

            // dag must be a node with id undefined. fix if necessary
            if (this.dag.id != undefined) {
                this.root = this.dag.copy();
                this.root.id = undefined;
                this.root.children = [this.dag];
                this.dag = this.root;
            }

            // get all d3-dag nodes and convert to family tree nodes
            this.nodes = this.dag.descendants().map(node => {
                if (node.id in data.unions) return new Union(node, this)
                else if (node.id in data.persons) return new Person(node, this);
            });

            // relink children arrays: use family tree nodes instead of d3-dag nodes
            this.nodes.forEach(n => n._children = n._children.map(c => c.ftnode));

            // make sure each node has an id
            this.number_nodes = 0;
            this.nodes.forEach(node => {
                node.id = node.id || this.number_nodes;
                this.number_nodes++;
            })

            // set root node
            this.root = this.find_node_by_id(start_node_id);
            this.root.visible = true;
            this.dag.children = [this.root];

        }
        // if no edges but only nodes are defined: root = dag
        else if (Object.values(data.persons).length > 0) {

            const root_data = data.persons[start_node_id];
            this.root = new d3.dagNode(start_node_id, root_data);
            this.root = new Person(this.root, this);
            this.root.visible = true;
            this.number_nodes = 1;
            this.nodes = [this.root];

            // dag must be a node with id undefined
            this.dag = new d3.dagNode(undefined, {});
            this.dag.children = this.root;
        }
    };

    update_roots() {
        this.dag.children = [this.root];
        const FT = this;

        function find_roots_recursive(node) {
            node.get_visible_inserted_neighbors().forEach(node => {
                if (node.is_root()) FT.dag.children.push(node);
                find_roots_recursive(node);
            });
        };
        find_roots_recursive(this.root);
    };

    find_node_by_id(id) {
        return this.nodes.find(node => node.id == id);
    };

};

class FTNode extends d3.dagNode {

    is_extendable() {
        return this.get_neighbors().filter(node => !node.visible).length > 0;
    };

    get_visible_neighbors() {
        return this.get_neighbors().filter(node => node.visible);
    }

    get_visible_inserted_neighbors() {
        return this.get_visible_neighbors().filter(node => this.inserted_nodes.includes(node));
    };

};

class Union extends FTNode {

    constructor(dagNode, ft_datahandler) {
        super(dagNode.id, data.unions[dagNode.id]);
        // link to new object
        dagNode.ftnode = this;
        // define additional family tree properties
        this.ft_datahandler = ft_datahandler;
        this._children = dagNode.children;
        this.children = [];
        this._childLinkData = dagNode._childLinkData;
        this.inserted_nodes = [];
        this.inserted_links = [];
        this.visible = false;
    };

    get_neighbors() {
        return this.get_parents().concat(this.get_children())
    };

    get_parents() {
        var parents = this.data.partner
            .map(id => this.ft_datahandler.find_node_by_id(id))
            .filter(node => node != undefined);
        if (parents) return parents
        else return [];
    }

    get_hidden_parents() {
        return this.get_parents().filter(parent => !parent.visible);
    };

    get_visible_parents() {
        return this.get_parents().filter(parent => parent.visible);
    };

    get_children() {
        var children = [];
        children = this.children.concat(this._children);
        // sort children by birth year ascending, filter undefined
        children = children
            .filter(c => c != undefined)
            .sort((a, b) => Math.sign((b.get_birth_year() || 0) - (a.get_birth_year() || 0)));
        return children
    };

    get_hidden_children() {
        return this.get_children().filter(child => !child.visible);
    };

    get_visible_children() {
        return this.get_children().filter(child => child.visible);
    };

    show_child(child) {
        if (!this._children.includes(child)) {
            console.warn("Child node not in this' _children array.");
        }
        this.children.push(child);
        this._children.remove(child);
        // if child is already visible, note a connection to destroy it later
        if (child.visible) {
            this.inserted_links.push([this, child]);
        }
        // if child is hidden, show it
        else {
            child.visible = true;
            this.inserted_nodes.push(child);
            // downstream part of the family tree is automatically reconstructed because children attribute
            // is not reset when hiding

        }
    };

    show_parent(parent) {
        if (!parent._children.includes(this)) {
            console.warn("This node not in parent's _children array.");
        }
        parent.children.push(this);
        parent._children.remove(this);
        // if parent is already visible, note a connection to destroy it later
        if (parent.visible) {
            this.inserted_links.push([parent, this]);
        }
        // if parent is hidden, show it
        else {
            parent.visible = true;
            this.inserted_nodes.push(parent);
        }
    };

    show() {

        this.visible = true;

        // show neighboring children
        this.get_children().forEach(child => {
            this.show_child(child);
        });

        // show neighboring parents
        this.get_parents().forEach(parent => {
            this.show_parent(parent);
        });

    };

    get_visible_inserted_children() {
        return this.children.filter(child => this.inserted_nodes.includes(child));
    };

    get_visible_inserted_parents() {
        return this.get_visible_parents().filter(parent => this.inserted_nodes.includes(parent));
    };

    is_root() {
        return false;
    }

    hide_child(child) {
        if (!this.children.includes(child)) {
            console.warn("Child node not in this's children array.");
        }
        child.visible = false;
        this._children.push(child);
        this.children.remove(child);
        this.inserted_nodes.remove(child);
    };

    hide_parent(parent) {
        if (!parent.children.includes(this)) {
            console.warn("This node not in parent's children array.");
        }
        parent.visible = false;
        parent._children.push(this);
        parent.children.remove(this);
        this.inserted_nodes.remove(parent);
    };

    hide() {

        this.visible = false;

        // hide neighboring children, if inserted by this node
        this.get_visible_inserted_children().forEach(child => {
            this.hide_child(child);
        });

        // hide neighboring parents, if inserted by this node
        this.get_visible_inserted_parents().forEach(parent => {
            this.hide_parent(parent);
        });

        // hide only edge (not node) if not inserted by this node
        this.inserted_links.forEach(edge => {
            const source = edge[0];
            const target = edge[1];
            if (this == source) {
                this._children.push(target);
                this.children.remove(target);
            } else if (this == target) {
                source._children.push(this);
                source.children.remove(this);
            };
        });
        this.inserted_links = [];

    };

    get_own_unions() {
        return [];
    };

    get_parent_unions() {
        return [];
    };

    get_name() {
        return undefined;
    };

    get_birth_year() {
        return undefined;
    };

    get_birth_place() {
        return undefined;
    };

    get_death_year() {
        return undefined;
    };

    get_death_place() {
        return undefined;
    };

    is_union() {
        return true;
    };

    add_parent(person_data) {
        // make person object
        const id = person_data.id || "p" + ++this.ft_datahandler.number_nodes;
        const dagNode = new d3.dagNode(id, person_data);
        const person = new Person(dagNode, this.ft_datahandler);
        if (!("parent_union" in person_data)) person_data.parent_union = undefined;
        if (!("own_unions" in person_data)) {
            person_data.own_unions = [this.id];
            person._childLinkData = [
                [person.id, this.id]
            ];
            person._children.push(this);
        }
        person.data = person_data;
        this.ft_datahandler.nodes.push(person);
        // make sure person lists this union as an own union
        if (!person_data.own_unions.includes(this.id)) person_data.own_unions.push(this.id);
        // make sure this union lists person as parent
        if (!this.data.partner.includes(person.id)) this.data.partner.push(person.id);
        // make union visible
        this.show_parent(person);
        this.ft_datahandler.update_roots();
        return person;
    };

    add_child(person_data) {
        // make person object
        const id = person_data.id || "p" + ++this.ft_datahandler.number_nodes;
        const dagNode = new d3.dagNode(id, person_data);
        const person = new Person(dagNode, this.ft_datahandler);
        if (!("parent_union" in person_data)) person_data.parent_union = this.id;
        if (!("own_unions" in person_data)) person_data.own_unions = [];
        person.data = person_data;
        this.ft_datahandler.nodes.push(person);
        // make sure person lists this union as an parent union
        if (!person_data.parent_union == this.id) person_data.parent_union == this.id;
        // make sure this union lists person as child
        if (!this.data.children.includes(person.id)) this.data.children.push(person.id);
        if (!this._childLinkData.includes([this.id, person.id])) this._childLinkData.push([this.id, person.id]);
        // make union visible
        this.show_child(person);
        return person;
    }

};

class Person extends FTNode {

    constructor(dagNode, ft_datahandler) {
        super(dagNode.id, data.persons[dagNode.id]);
        // link to new object
        dagNode.ftnode = this;
        // define additional family tree properties
        this.ft_datahandler = ft_datahandler;
        this._children = dagNode.children;
        this.children = [];
        this._childLinkData = dagNode._childLinkData;
        this.inserted_nodes = [];
        this.inserted_links = [];
        this.visible = false;
    };

    get_name() {
        return this.data.name;
    };

    get_birth_year() {
        return this.data.birthyear;
    };

    get_birth_place() {
        return this.data.birthplace;
    };

    get_death_year() {
        return this.data.deathyear;
    };

    get_death_place() {
        return this.data.deathplace;
    };

    get_neighbors() {
        return this.get_own_unions().concat(this.get_parent_unions());
    };

    get_parent_unions() {
        var unions = [this.data.parent_union]
            .map(id => this.ft_datahandler.find_node_by_id(id))
            .filter(node => node != undefined);
        var u_id = this.data.parent_union;
        if (unions) return unions
        else return [];
    };

    get_hidden_parent_unions() {
        return this.get_parent_unions().filter(union => !union.visible);
    };

    get_visible_parent_unions() {
        return this.get_parent_unions().filter(union => union.visible);
    };

    get_visible_inserted_parent_unions() {
        return this.get_visible_parent_unions().filter(union => this.inserted_nodes.includes(union));
    };

    is_root() {
        return this.get_visible_parent_unions().length == 0;
    };

    is_union() {
        return false;
    };

    get_own_unions() {
        var unions = this.data.own_unions
            .map(id => this.ft_datahandler.find_node_by_id(id))
            .filter(u => u != undefined);
        if (unions) return unions
        else return [];
    };

    get_hidden_own_unions() {
        return this.get_own_unions().filter(union => !union.visible);
    };

    get_visible_own_unions() {
        return this.get_own_unions().filter(union => union.visible);
    };

    get_visible_inserted_own_unions() {
        return this.get_visible_own_unions().filter(union => this.inserted_nodes.includes(union));
    };

    get_parents() {
        var parents = [];
        this.get_parent_unions().forEach(
            u => parents = parents.concat(u.get_parents())
        );
    };

    get_other_partner(union_data) {
        var partner_id = union_data.partner.find(
            p_id => p_id != this.id & p_id != undefined
        );
        return all_nodes.find(n => n.id == partner_id)
    };

    get_partners() {
        var partners = [];
        this.get_own_unions().forEach(
            u => {
                partners.push(this.get_other_partner(u.data))
            }
        )
        return partners.filter(p => p != undefined)
    };

    get_children() {
        var children = [];
        this.get_own_unions().forEach(
                u => children = children.concat(getChildren(u))
            )
        // sort children by birth year ascending, filter undefined
        children = children
            .filter(c => c != undefined)
            .sort((a, b) => Math.sign((b.get_birth_year() || 0) - (a.get_birth_year() || 0)));
        return children
    };

    show_union(union) {
        union.show();
        this.inserted_nodes.push(union);
    };

    hide_own_union(union) {
        union.hide();
        this.inserted_nodes.remove(union);
    };

    hide_parent_union(union) {
        union.hide();
    };

    show() {
        this.get_hidden_own_unions().forEach(union => this.show_union(union));
        this.get_hidden_parent_unions().forEach(union => this.show_union(union));
    };

    hide() {
        this.get_visible_inserted_own_unions().forEach(union => this.hide_own_union(union));
        this.get_visible_inserted_parent_unions().forEach(union => this.hide_parent_union(union));
    };

    click() {
        // extend if there are uncollapsed neighbor unions
        if (this.is_extendable()) this.show();
        // collapse if fully extended
        else this.hide();
        // update dag roots
        this.ft_datahandler.update_roots();
    };

    add_own_union(union_data) {
        // make union object
        const id = union_data.id || "u" + ++this.ft_datahandler.number_nodes;
        const dagNode = new d3.dagNode(id, union_data);
        const union = new Union(dagNode, this.ft_datahandler);
        if (!("partner" in union_data)) union_data.partner = [this.id];
        if (!("children" in union_data)) {
            union_data.children = [];
            union._childLinkData = [];
        }
        union.data = union_data;
        this.ft_datahandler.nodes.push(union);
        // make sure union lists this person as a partner        
        if (!union_data.partner.includes(this.id)) union_data.partner.push(this.id);
        // make sure this person lists union as own_union
        if (!this.data.own_unions.includes(union.id)) this.data.own_unions.push(union.id);
        if (!this._childLinkData.includes([this.id, union.id])) this._childLinkData.push([this.id, union.id]);
        // make union visible
        this.show_union(union);
        return union;
    };

    add_parent_union(union_data) {
        // make union object
        const id = union_data.id || "u" + ++this.ft_datahandler.number_nodes;
        const dagNode = new d3.dagNode(id, union_data);
        const union = new Union(dagNode, this.ft_datahandler);
        if (!("partner" in union_data)) union_data.partner = [];
        if (!("children" in union_data)) {
            union_data.children = [this.id];
            union._childLinkData = [
                [union.id, this.id]
            ];
            union._children.push(this);
        }
        union.data = union_data;
        this.ft_datahandler.nodes.push(union);
        // make sure union lists this person as a child
        if (!union_data.children.includes(this.id)) union_data.children.push(this.id);
        // make sure this person lists union as own_union
        this.data.parent_union = union.id;
        // make union visible
        this.show_union(union);
        this.ft_datahandler.update_roots();
        return union;
    };

};

class FTDrawer {

    static label_delimiter = "_";

    constructor(
        ft_datahandler,
        svg,
        x0 = svg.attr("height") / 2,
        y0 = svg.attr("width") / 2,
    ) {
        this.ft_datahandler = ft_datahandler;
        this.svg = svg;
        this.link_css_class = "link";

        // append group element to draw family tree in
        this.g = this.svg.append("g");

        // initialize panning, zooming
        this.zoom = d3.zoom().on("zoom", _ => this.g.attr("transform", d3.event.transform));
        this.svg.call(this.zoom);

        // initialize tooltips
        this.tip = d3.tip()
            .attr('class', 'tooltip')
            .direction('e')
            .offset([0, 5]);
        this.svg.call(this.tip);
        this.tooltip(FTDrawer.default_tooltip_func);

        // initialize dag layout maker
        this.layout = d3.sugiyama()
            .nodeSize([50, 120])
            .layering(d3.layeringSimplex())
            .decross(d3.decrossOpt)
            .coord(d3.coordVert());

        // defaults
        this.transition_duration(750);
        this.link_path(FTDrawer.default_link_path_func);
        this.node_label(FTDrawer.default_node_label_func);
        this.node_size(FTDrawer.default_node_size_func);
        this.node_class(FTDrawer.default_node_class_func);

        // set starting position for root node
        this.ft_datahandler.root.x0 = x0;
        this.ft_datahandler.root.y0 = y0;
    };

    node_separation(value) {
        if (!value) return this.layout.nodeSize();
        else {
            this.layout.nodeSize(value);
            return this;
        }
    };

    layering(value) {
        if (!value) return this.layout.layering();
        else {
            this.layout.layering(value);
            return this;
        }
    };

    decross(value) {
        if (!value) return this.layout.decross();
        else {
            this.layout.decross(value);
            return this;
        }
    };

    coord(value) {
        if (!value) return this.layout.coord();
        else {
            this.layout.coord(value);
            return this;
        }
    };

    transition_duration(value) {
        if (value != 0 & !value) return this._transition_duration;
        else {
            this._transition_duration = value;
            return this;
        }
    };

    static default_tooltip_func(node) {
        if (node.is_union()) return;
        var content = `
                <span style='margin-left: 2.5px;'><b>` + node.get_name() + `</b></span><br>
                <table style="margin-top: 2.5px;">
                        <tr><td>born</td><td>` + (node.get_birth_year() || "?") + ` in ` + (node.data.birthplace || "?") + `</td></tr>
                        <tr><td>died</td><td>` + (node.get_death_year() || "?") + ` in ` + (node.data.deathplace || "?") + `</td></tr>
                </table>
                `
        return content.replace(new RegExp("null", "g"), "?");
    };

    tooltip(tooltip_func) {
        if (!tooltip_func) {
            this.show_tooltips = false;
        } else {
            this.show_tooltips = true;
            this.tip.html(tooltip_func);
        }
        return this;
    };

    static default_node_label_func(node) {
        // node label function
        // text will be split into multiple lines where `label_delimiter` is used
        if (node.is_union()) return;
        return node.get_name() +
            FTDrawer.label_delimiter +
            (node.get_birth_year() || "?") + " - " + (node.get_death_year() || "?");
    };

    node_label(node_label_func) {
        if (!node_label_func) {} else { this.node_label_func = node_label_func };
        return this;
    };

    static default_node_class_func(node) {
        // returns a stirng which determines a node's css class assignments
        if (node.is_union()) return;
        else {
            if (node.is_extendable()) return "person extendable"
            else return "person non-extendable"
        };
    };

    node_class(node_class_func) {
        if (!node_class_func) {} else { this.node_class_func = node_class_func };
        return this;
    };

    static default_node_size_func(node) {
        // returns an integer determining the node's size
        if (node.is_union()) return 0;
        else return 10;
    }

    node_size(node_size_func) {
        if (!node_size_func) {} else { this.node_size_func = node_size_func };
        return this;
    };

    static default_link_path_func(s, d) {
        function diagonal(s, d) {
            // Creates a curved (diagonal) path from parent to the child nodes
            return `M ${s.y} ${s.x}
                C ${(s.y + d.y) / 2} ${s.x},
                  ${(s.y + d.y) / 2} ${d.x},
                  ${d.y} ${d.x}`
        }
        return diagonal(s, d);
    }

    link_path(link_path_func) {
        if (!link_path_func) {} else { this.link_path_func = link_path_func };
        return this;
    }

    static make_unique_link_id(link) {
        return link.id || link.source.id + "_" + link.target.id;
    }

    draw(source = this.ft_datahandler.root) {

        // get visible nodes and links
        const nodes = this.ft_datahandler.dag.descendants(),
            links = this.ft_datahandler.dag.links();

        // assign new x and y positions to all nodes
        this.layout(this.ft_datahandler.dag);

        // ****************** Sort section ***************************
        // Here we sort every *visible* node, starting at layer 2 (I have assumed single root node at level 0, and single union at level 1). I create a
        // sortable rank number using digits <birthYear><unionYear> first to get node sort order, but then 'reducing' to an integer number i.e. 1, 2, 3
        // once the order is known; layer 4 and below (remembering that odd numbered layers are unions and don't need to be sorted, as the dag edge stays
        // joined to the nodes once sorted) then use digits <parentRank><birthYear><unionYear> (by looking up parent ID in the layerRank array) but also
        // reduced to an integer
        // NB: the ranks are independent on each layer, so can always start back at 1; the trick is using them in the <parentRank><birthYear><unionYear>
        // calculation for the true rank before reducing (i.e. dateRank = 100000000*parentRank + 10000*birthyear + unionYear)
        var nodeRanks = [];
        for (let i = 2; i <= Math.max.apply(null, nodes.map(object => object.layer)); i = i + 2) {
            var layerRank = [];
            nodes.filter(x => x.layer == i).forEach(
                n => {
                    // Shift the birthyear up 4 places to allow adding union year i.e born in 1970 and married in 1996 would give 19701996, born in 1978 and not married would give 19780000
                    var dateRank = 10000;
                    // In case the birthyear isn't defined
                    if (typeof n.data.birthyear === 'number') {
                        var dateRank = 10000*n.data.birthyear;
                    }
                    // If neighbours are all lower layers than target layer, we know this is a new partner from a union
                    var minNeighborLayer = Math.min(...n.get_neighbors().filter(x => x.visible).map(o => o.layer));
                    if (minNeighborLayer > i) {
                        // find [first] union's partner's birthyear
                        var unionId = n.children[0].id,
                            partnerId = n.children[0].data.partner.filter(x => x != n.id)[0];
                        // If layer 2 do simple date rank, but if below layer 2, also need to get the union's partner's parent rank
                        if (i == 2) {
                            dateRank = 10000*(n.get_neighbors().filter(x => x.id == unionId)[0].get_neighbors().filter(y => y.id == partnerId)[0].data.birthyear) + n.children[0].data.unionYear;
                        } else {
                            var parentId = n.get_neighbors().filter(x => x.id == unionId)[0].get_neighbors().filter(y => y.id == partnerId)[0].get_neighbors().filter(z => z.layer == i-1)[0].data.partner[0];
                            dateRank = 1000000000*nodeRanks.filter(x => x.id == parentId)[0].rank + 10000*(n.get_neighbors().filter(x => x.id == unionId)[0].get_neighbors().filter(y => y.id == partnerId)[0].data.birthyear) + n.children[0].data.unionYear;
                            // For correct order when multiple parent unions, need to use union's partner's other parent rank
                            if (typeof n.get_neighbors().filter(x => x.id == unionId)[0].get_neighbors().filter(y => y.id == partnerId)[0].get_neighbors().filter(z => z.layer == i-1)[0].data.partner[1] === 'string') {
                                var other = n.get_neighbors().filter(x => x.id == unionId)[0].get_neighbors().filter(y => y.id == partnerId)[0].get_neighbors().filter(z => z.layer == i-1)[0].data.partner[1];
                                dateRank += 100000000*nodeRanks.filter(x => x.id == other)[0].rank;
                            }
                        }
                    // If this not a new partner from a union, and it's below layer 2, we know there is a parent and we need to add their rank; as the
                    // immediate parent in the dag is going to be a union, we have to step back two layers
                    } else {
                        if (i > 2) {
                            // For ranking, either parent's rank works, so just take first one
                            var parentId = n.get_neighbors().filter(x => x.layer == i-1)[0].data.partner[0];
                            dateRank += 1000000000*nodeRanks.filter(x => x.id == parentId)[0].rank;
                            // For correct order when multiple parent unions, need to use other parent rank
                            if (typeof n.get_neighbors().filter(x => x.layer == i-1)[0].data.partner[1] === 'string') {
                                var other = n.get_neighbors().filter(x => x.layer == i-1)[0].data.partner[1];
                                dateRank += 100000000*nodeRanks.filter(x => x.id == other)[0].rank;
                            }
                        }
                    }
                    layerRank.push({"rank":dateRank, "id":n.id});
                }
            )
            // Sort the calculated ranks, but instead of storing the calculation result, just store the position integer
            layerRank.sort((a, b) => {
                return a.rank - b.rank;
            });
            var r = 1;
            layerRank.forEach(
                l => {
                    nodeRanks.push({"rank":r, "id":l.id});
                    r += 1;
                }
            )
        }
        // Now go through layers and re-order x positions based on nodeRanks, iterating across layers to
        //    a) if level i get rank & pos, sort rank & pos
        //    b) if level i update pos
        //    c) if level i+1 update union pos
        //    d) calc union (i+1) and child (i+2) averages
        //    e) update child (i+2) pos to equalise union and child averages
        // NB: we only have to shift - not sort - the child (i+2) when looking at i, as next loop of i=i+2 will then reorder them
        for (let i = 2; i <= Math.max.apply(null, nodes.map(object => object.layer)); i = i + 2) {
            var layerRank = [],
                layerPos = [];
            // First pass: record the ranks and ids for this layer in one array, x-positions in another
            nodes.filter(x => x.layer == i).forEach(
                n => {
                    layerRank.push({"rank":nodeRanks.filter(x => x.id == n.id)[0].rank, "id":n.id});
                    layerPos.push(n.x);
                }
            )
            // Sort the rank+id array, then the x-position array; result will be a matching list of ids and the correct x-positions
            layerRank.sort((a, b) => {
                return a.rank - b.rank;
            });
            layerPos = layerPos.sort(function(a, b){return a-b});
            // Second pass: update the x-positions
            nodes.filter(x => x.layer == i).forEach(
                n => {
                    // Use map to pull just the ids, and use that index to get x-position, i.e. first rank should have first position
                    n.x = layerPos[layerRank.map(object => object.id).indexOf(n.id)];
                }
            )
            // Third pass: update the visible unions (at layer below the calculations in first + second passes)
            // We're using even numbered steps in the for loop; layers 0, 2, 4 etc. are nodes, layers 1, 3, 5 etc. are unions
            // For adjusting children of this layer, need to record the average union x-pos, then adjust child layer evenly (not per union)
            var unionTotalX = 0,
                unionCount = 0;
            nodes.filter(x => x.layer == i+1).forEach(
                n => {
                    var newUnionX = (layerPos[layerRank.map(object => object.id).indexOf(n.data.partner[0])] + layerPos[layerRank.map(object => object.id).indexOf(n.data.partner[1])])/2;
                    n.x = newUnionX;
                    unionTotalX += newUnionX;
                    unionCount += 1;
                }
            )
            // If there are any unions, also need to check child layer x-positions
            if (unionCount > 0) {
                var childTotalX = 0,
                    childCount = 0;
                // Fourth pass: calculate the average x-pos for children of this layer
                nodes.filter(x => x.layer == i+2).forEach(
                    n => {
                        childTotalX += n.x;
                        childCount += 1;
                    }
                )
                if (childCount > 0) {
                    // Child delta is difference between average union x-pos and average child x-pos
                    var childDeltaX = unionTotalX/unionCount - childTotalX/childCount;
                    // Fifth pass: adjust children of this layer, if there are any, centred around the new union x-position(s)
                    nodes.filter(x => x.layer == i+2).forEach(
                        n => {
                            n.x += childDeltaX;
                        }
                    )
                }
            }
        }

        // ****************** Nodes section ***************************

        // assign node data
        var node = this.g.selectAll('g.node')
            .data(nodes, node => node.id)

        // insert new nodes at the parent's previous position.
        var nodeEnter = node.enter().append('g')
            .attr('class', 'node')
            .attr("transform", _ => "translate(" + source.y0 + "," + source.x0 + ")")
            .on('click', node => {
                node.click();
                this.draw(node);
            })
            .attr('visible', true);

        // add tooltip
        if (this.show_tooltips) nodeEnter.on('mouseover', this.tip.show).on('mouseout', this.tip.hide);

        // add a circle for each node
        nodeEnter.append('circle')
            .attr('class', this.node_class_func)
            .attr('r', 1e-6)

        // add node label
        const this_object = this;
        nodeEnter.each(function(node) {
            d3_append_multiline_text(
                d3.select(this),
                this_object.node_label_func(node),
                FTDrawer.label_delimiter,
                "node-label",
            )
        });

        // UPDATE
        var nodeUpdate = nodeEnter.merge(node);

        // transition node to final coordinates
        nodeUpdate.transition()
            .duration(this.transition_duration())
            .attr("transform", d => "translate(" + d.y + "," + d.x + ")");

        // update node style
        nodeUpdate.select('.node circle')
            .attr('r', this.node_size_func)
            .attr('class', this.node_class_func)
            .attr('cursor', 'pointer');

        // remove hidden nodes
        var nodeExit = node.exit().transition()
            .duration(this.transition_duration())
            .attr("transform", _ => "translate(" + source.y + "," + source.x + ")")
            .attr('visible', false)
            .remove();

        // animation: shrink hidden nodes
        nodeExit.select('circle')
            .attr('r', 1e-6);

        // animation: hide hidden nodes' labels
        nodeExit.select('text')
            .style('fill-opacity', 1e-6);

        // ****************** links section ***************************

        // Update the links...
        var link = this.g.selectAll('path.' + this.link_css_class)
            .data(links, FTDrawer.make_unique_link_id);

        // Enter any new links at the parent's previous position.
        var linkEnter = link.enter().insert('path', "g")
            .attr("class", this.link_css_class)
            .attr('d', _ => {
                var o = {
                    x: source.x0,
                    y: source.y0
                }
                return this.link_path_func(o, o)
            });

        // UPDATE
        var linkUpdate = linkEnter.merge(link);

        // Transition back to the parent element position
        linkUpdate.transition()
            .duration(this.transition_duration())
            .attr('d', d => this.link_path_func(d.source, d.target));

        // Remove any exiting links
        var linkExit = link.exit().transition()
            .duration(this.transition_duration())
            .attr('d', _ => {
                var o = {
                    x: source.x,
                    y: source.y
                }
                return this.link_path_func(o, o)
            })
            .remove();

        // expanding a big subgraph moves the entire dag out of the window
        // to prevent this, cancel any transformations in y-direction
        this.svg.transition()
            .duration(this.transition_duration())
            .call(
                this.zoom.transform,
                d3.zoomTransform(this.g.node()).translate(-(source.y - source.y0), -(source.x - source.x0)),
            );

        // store current node positions for next transition
        nodes.forEach(function(d) {
            d.x0 = d.x;
            d.y0 = d.y;
        });

    };
};

class FamilyTree extends FTDrawer {

    constructor(data, svg) {
        const ft_datahandler = new FTDataHandler(data);
        super(ft_datahandler, svg);
    };

    get root() {
        return this.ft_datahandler.root;
    }

};
