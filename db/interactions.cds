namespace app.salesK;

using { cuid } from '@sap/cds/common';

type Price    : Decimal(10, 2);
type Quantity : Integer;
type Email    : String(320);
type Status   : String(255);
type URL      : String(1024);
type DocNumber: String(10);

entity Approvers {
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

entity Sales {
    key salesID : DocNumber;
    comprador   : Email;
    vendor      : Email;
    status      : Status;
    valor_total : Price;
    valor_iva   : Price;
    items       : Composition of many SalesItems
                    on items.sale = $self;
};

entity SalesItems {
    key salesID : DocNumber;
    key item    : Integer;
    sale        : Association to Sales;
    material    : Association to one Materials;
    description : String(1024);
    price_unit  : Price;
    iva_unit    : Price;
    price_total : Price;
    qtd         : Quantity;
};
