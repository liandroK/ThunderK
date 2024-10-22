using app.salesK from '../db/interactions';

service Sales.service {
    
    type Email: String(320);
  
    type Sales {
        email_comprador   : Email;
        email_vendor      : Email;
        items       : many SalesItems;  
    };

    type SalesItems {
        material    : String;
        price_unit  : Decimal(10, 2);
        qtd         : Integer;
    };

    @odata.draft.bypass: true
    entity aprovadores as projection on salesK.Approvers;
    
    @odata.draft.bypass: true
    entity artigos as select from salesK.Materials;

    @readonly: true
    entity sales as projection on salesK.Sales;
    
    @readonly: true
    entity salesItems as projection on salesK.SalesItems;
  
    // Função que recebe Sales como input e retorna uma Stringsasa
    function create_salesorder(sales: Sales) returns String;

    action updateStatus(id: UUID, status: String) returns Boolean;
}
   