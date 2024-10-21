namespace app.salesK;

using { cuid } from '@sap/cds/common';

type Price    : Decimal(10, 2);
type Quantity : Integer;
type Email    : String(320);
type Status   : String(255);
type URL      : String(1024);

entity Approvers : cuid {
    key vendor: Email;
    approver: Email;
};

entity Materials : cuid {
    name        : String(255);
    description : String(1024);
    price       : Price;
    stock       : Quantity;
    url_imagem  : URL;
};

entity Sales : cuid {
    comprador   : String(255);
    vendor      : Association to Approvers;
    status      : Status;
    valor_total : Price;
    valor_iva   : Price;
    items       : Composition of many SalesItems
                    on items.sale = $self;
};

entity SalesItems : cuid {
    sale        : Association to Sales;
    item        : Integer;
    material    : Association to one Materials;
    description : String(1024);
    price_unit  : Price;
    price_total : Price;
    qtd         : Quantity;
};
